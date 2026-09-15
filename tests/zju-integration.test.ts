import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import prisma from "../src/lib/prisma";
import { encryptSecret } from "../src/lib/zju/shared";
import { writeToolState, readToolState, withToolLock } from "../src/lib/zju/state";
import { cleanupZjuArtifacts } from "../src/lib/zju/cleanup";
import { checkGrades, gradeOverview, saveGradeSettings } from "../src/lib/zju/grades";
import { createMaterialDownloadJob } from "../src/lib/zju/courses";
import { createQuizAnswersJob } from "../src/lib/zju/quiz";
import { createEvaluationJob, getEvaluationCourses } from "../src/lib/zju/evaluation";

test("isolated users, locks, incremental cache, mocked grade/evaluation APIs, and physical cleanup", { skip: process.env.ZJU_INTEGRATION_TEST !== "1" }, async () => {
  const prefix = `zju-test-${Date.now()}`;
  const users = [`${prefix}-a`, `${prefix}-b`];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zju-integration-"));
  const originalRoot = process.env.ZJU_TOOL_DATA_DIR;
  process.env.ZJU_TOOL_DATA_DIR = root;
  const { COURSES, ALT, ZDBK } = await import("login-zju");
  const originalCourses = COURSES.prototype.fetch;
  const originalAlt = ALT.prototype.fetch;
  const originalGrades = ZDBK.prototype.fetch;
  const originalFetch = globalThis.fetch;
  let materialDownloads = 0; let submitted = 0; let grade = "90"; let failNotify = true; let notifications = 0;
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  // Block all unmocked network requests; these tests never contact ZJU or DingTalk.
  globalThis.fetch = async (input) => {
    if (String(input).startsWith("https://oapi.dingtalk.com/")) { notifications++; return json(failNotify ? { errcode: 1 } : { errcode: 0 }); }
    throw new Error("Unmocked network request blocked");
  };
  COURSES.prototype.fetch = async (url) => {
    if (String(url).endsWith("/activities")) return json({ activities: [{ id: 10, type: "material", uploads: [{ id: 11, name: "课件.pdf", size: 7 }] }] });
    if (String(url).endsWith("/blob")) { materialDownloads++; return new Response("fixture"); }
    if (String(url).endsWith("/subject")) return json({ subjects: [{ id: 1, type: "single_choice", description: '<b>题目</b><img src="/x.png">', options: [{ sort: 0, content: "正确", is_answer: true }] }] });
    throw new Error("Unmocked courses API");
  };
  ALT.prototype.fetch = async (url) => {
    if (url.endsWith("page_my_todo_plan_course_list")) return json({ data: { data: [{ id: "c" }] } });
    if (url.endsWith("find_plan_courses_by_user")) return json({ data: { groupId: "g", courseName: "测试课程", teacherList: [{ userSid: "t", userName: "教师", filled: false }] } });
    if (url.endsWith("insert_document")) return json({ code: 200, data: "form" });
    if (url.endsWith("save_plan_courses_by_user")) { submitted++; return json({ code: 200 }); }
    throw new Error("Unmocked ALT API");
  };
  ZDBK.prototype.fetch = async (url) => String(url).includes("MyCosJxpj") ? json({ result: "1" }) : json({ items: [{ xkkh: "c", kcmc: "测试课程", cj: grade, xf: "2", jd: "4" }] });
  async function finished(id: string) {
    for (let i = 0; i < 100; i++) {
      const job = await prisma.zjuToolJob.findUniqueOrThrow({ where: { id } });
      if (!["queued", "running"].includes(job.status)) { assert.equal(job.status, "succeeded", job.error || job.logs); return job; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Job timed out");
  }
  try {
    for (const id of users) {
      await prisma.user.create({ data: { id, name: "ZJU test fixture", email: `${id}@example.invalid`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() } });
      const secret = encryptSecret("fixture-password");
      await prisma.zjuAccount.create({ data: { userId: id, username: "fixture", passwordCiphertext: secret.ciphertext, passwordIv: secret.iv, passwordTag: secret.tag, lastValidatedAt: new Date() } });
    }
    await writeToolState(users[0], "test", { cache: [1] });
    assert.deepEqual(await readToolState(users[1], "test"), {});
    await withToolLock(users[0], "lock-test", async () => { await assert.rejects(() => withToolLock(users[0], "lock-test", async () => true)); });
    await finished((await createMaterialDownloadJob({ userId: users[0], courseId: "c", incremental: true })).id);
    // Wait for the runner to release its lock after recording completion.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await finished((await createMaterialDownloadJob({ userId: users[0], courseId: "c", incremental: true })).id);
    assert.equal(materialDownloads, 1);
    assert.equal((await readToolState(users[1], "materials:c")).cache, undefined);
    const quiz = await finished((await createQuizAnswersJob({ userId: users[0], classroomId: "q", title: "测试课程-测验" })).id);
    assert.ok((await fs.readFile(path.join(quiz.workDir!, "QA-测试课程-测验.html"), "utf8")).includes("<b>题目</b>"));
    const courses = await getEvaluationCourses(users[0]);
    assert.equal(courses[0].teacherList.length, 1);
    await finished((await createEvaluationJob(users[0], [{ courseId: "c", teacherIds: ["t"] }])).id);
    assert.equal(submitted, 1);
    await checkGrades(users[0]);
    assert.equal(notifications, 0);
    await saveGradeSettings(users[0], { notifications: true, webhook: "https://oapi.dingtalk.com/robot/send?access_token=fixture" });
    assert.ok(!JSON.stringify(await gradeOverview(users[0])).includes("access_token"));
    grade = "95";
    await assert.rejects(() => checkGrades(users[0]));
    assert.equal(((await readToolState(users[0], "grades")).scores as Record<string, Record<string, string>>).c.cj, "90");
    failNotify = false;
    await checkGrades(users[0]);
    assert.equal(((await readToolState(users[0], "grades")).scores as Record<string, Record<string, string>>).c.cj, "95");
    assert.equal(notifications, 2);
    const dir = path.join(root, users[0], "expired"); await fs.mkdir(dir, { recursive: true }); await fs.writeFile(path.join(dir, "old.zip"), "old");
    const expired = await prisma.zjuToolJob.create({ data: { userId: users[0], tool: "test", status: "succeeded", workDir: dir, createdAt: new Date(Date.now() - 49 * 3600000), output: { files: [{ name: "old.zip", path: path.join(dir, "old.zip"), size: 3 }] } } });
    await cleanupZjuArtifacts();
    await assert.rejects(() => fs.stat(dir));
    assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({ where: { id: expired.id } })).workDir, null);
    assert.ok(await fs.stat(quiz.workDir!));
  } finally {
    COURSES.prototype.fetch = originalCourses; ALT.prototype.fetch = originalAlt; ZDBK.prototype.fetch = originalGrades; globalThis.fetch = originalFetch;
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await fs.rm(root, { recursive: true, force: true });
    if (originalRoot === undefined) delete process.env.ZJU_TOOL_DATA_DIR; else process.env.ZJU_TOOL_DATA_DIR = originalRoot;
    await prisma.$disconnect();
  }
});
