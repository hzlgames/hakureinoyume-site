import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { judgeInfo } from "./evaluation-payload";
import { activeJobs, createJobLogger } from "./jobs";
import { asRecord, toJsonValue } from "./shared";
import { withToolLock } from "./state";

type Teacher = { userSid: string; userName: string; filled: boolean };
export type EvaluationCourse = { id: string; courseName: string; groupId: string; teacherList: Teacher[] };
async function evaluationClient(userId: string) {
  const secret = await getZjuSecret(userId);
  const { ALT, ZJUAM } = await import("login-zju");
  return new ALT(new ZJUAM(secret.username, secret.password));
}
async function post(client: Awaited<ReturnType<typeof evaluationClient>>, endpoint: string, body: unknown, signal?: AbortSignal) {
  const response = await client.fetch(`https://alt.zju.edu.cn/dapi/v2/${endpoint}`, { method: "POST", body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const result = await response.json();
  if (result.code !== undefined && result.code !== 200) throw new Error(`评教接口返回错误：${result.code}`);
  return result;
}
async function listWithClient(client: Awaited<ReturnType<typeof evaluationClient>>, signal?: AbortSignal) {
  const courses: EvaluationCourse[] = [];
  const seen = new Set<string>();
  for (let pageNum = 0; pageNum < 100; pageNum++) {
    const response = await post(client, "tes/evaluation_plan_service/page_my_todo_plan_course_list", { pageNum, pageSize: 20 }, signal);
    const list = response?.data?.data ?? [];
    if (!Array.isArray(list)) throw new Error("待评教列表格式异常。");
    let added = 0;
    for (const course of list) {
      const id = String(course.id);
      if (seen.has(id)) continue;
      seen.add(id); added++;
      const detail = asRecord((await post(client, "tes/evaluation_plan_service/find_plan_courses_by_user", { planCourseId: id }, signal)).data);
      if (!detail.groupId) throw new Error(`课程 ${id} 的评教详情读取失败。`);
      const teachers = Array.isArray(detail.teacherList) ? detail.teacherList : [];
      courses.push({ id, courseName: String(detail.courseName || id), groupId: String(detail.groupId), teacherList: teachers.map((item) => { const t = asRecord(item); return { userSid: String(t.userSid), userName: String(t.userName || t.userSid), filled: !!t.filled }; }) });
    }
    if (list.length < 20 || !added) break;
  }
  return courses;
}
export async function getEvaluationCourses(userId: string) {
  return listWithClient(await evaluationClient(userId));
}
export async function createEvaluationJob(userId: string, selections: Array<{ courseId: string; teacherIds: string[] }>) {
  if (!selections.length) throw new Error("请选择要评教的课程与教师。");
  const job = await prisma.zjuToolJob.create({ data: { userId, tool: "alt.zju/autojudge", input: toJsonValue({ selections }), status: "queued" } });
  void withToolLock(userId, "evaluation", async () => {
    const abort = new AbortController();
    activeJobs.set(job.id, { abort, userId });
    const logger = createJobLogger(job.id);
    try {
      const started = await prisma.zjuToolJob.updateMany({ where: { id: job.id, status: "queued" }, data: { status: "running", startedAt: new Date() } });
      if (!started.count) return;
      const client = await evaluationClient(userId);
      const courses = await listWithClient(client, abort.signal);
      let ok = 0; let fail = 0;
      for (const selected of selections) {
        abort.signal.throwIfAborted();
        const course = courses.find((item) => item.id === selected.courseId);
        if (!course) { fail++; logger.log(`课程 ${selected.courseId} 已不在待评列表。`); continue; }
        const teachers = course.teacherList.filter((teacher) => selected.teacherIds.includes(teacher.userSid));
        if (!teachers.length) continue;
        logger.log(`${course.courseName}：提交 ${teachers.length} 位教师的满分评价。`);
        try {
          const form = await post(client, "autoform/document_service/insert_document", { groupId: course.groupId, value: judgeInfo }, abort.signal);
          if (!form.data) throw new Error("未取得评教表单 ID。");
          for (const teacher of teachers) {
            abort.signal.throwIfAborted();
            try {
              await post(client, "tes/evaluation_plan_service/save_plan_courses_by_user", { planCourseId: course.id, teaching: true, formId: form.data, teaSid: teacher.userSid }, abort.signal);
              ok++; logger.log(`${teacher.userName}：成功。`);
            } catch (error) { if (abort.signal.aborted) throw error; fail++; logger.log(`${teacher.userName}：提交失败。`); }
          }
        } catch (error) { if (abort.signal.aborted) throw error; fail += teachers.length; logger.log(`${course.courseName}：创建表单失败。`); }
      }
      await prisma.zjuToolJob.update({ where: { id: job.id }, data: { status: fail ? "failed" : "succeeded", finishedAt: new Date(), exitCode: fail ? 1 : 0, output: toJsonValue({ ok, fail }), error: fail ? `${fail} 项未完成，请查看日志。` : null } });
    } catch (error) {
      await prisma.zjuToolJob.update({ where: { id: job.id }, data: { status: abort.signal.aborted ? "cancelled" : "failed", finishedAt: new Date(), error: abort.signal.aborted ? "已取消；已提交的评价不会撤回。" : error instanceof Error ? error.message : "评教失败。" } });
    } finally { await logger.flush(); activeJobs.delete(job.id); }
  }).catch(async (error) => { await prisma.zjuToolJob.update({ where: { id: job.id }, data: { status: "failed", finishedAt: new Date(), error: error.message } }); });
  return job;
}
