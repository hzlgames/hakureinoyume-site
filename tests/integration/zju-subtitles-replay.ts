// RUN_PAID_SUBTITLE_TEST=1 opts into real ASR billing; default test commands never run this file.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import prisma from "../../src/lib/prisma";
import { authorizeSubtitleLesson, heartbeatLiveSubtitles, readLiveSubtitles, leaveLiveSubtitles } from "../../src/lib/zju/subtitles";
import { lessonKey } from "../../src/lib/zju/subtitle-core";

async function main() {
  if (process.env.RUN_PAID_SUBTITLE_TEST !== "1" || !new URL(process.env.DATABASE_URL!).pathname.startsWith("/hakurei_subtitles_replay_validation_")) throw new Error("Use an explicitly enabled paid test and a fresh isolated replay validation database.");
  const manifestPath = process.env.SUBTITLE_REPLAY_MANIFEST;
  if (!manifestPath) throw new Error("SUBTITLE_REPLAY_MANIFEST is required.");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const identity = { courseId: String(manifest.courseId ?? "87601"), subId: String(manifest.subId ?? "2034357") };
  const users = await prisma.zjuAccount.findMany({ where: { lastValidatedAt: { not: null } }, select: { userId: true }, take: 2 });
  if (users.length !== 2) throw new Error("Prepare two existing authorized users in the isolated database.");
  await Promise.all(users.map(u => authorizeSubtitleLesson(u.userId, identity)));
  const row = await prisma.zjuLiveSubtitle.create({ data: { ...identity, lessonKey: lessonKey(identity), type: "course_live", title: "同课节教室回放稳定性验证", expiresAt: new Date(Date.now() + 604800000) } });
  const clients = users.map(() => randomUUID());
  for (const [i, user] of users.entries()) {
    await prisma.zjuLiveSubtitleViewer.create({ data: { subtitleId: row.id, userId: user.userId, clientId: clients[i] } });
    await prisma.zjuLiveSubtitleGrant.create({ data: { subtitleId: row.id, userId: user.userId } });
  }
  const children: ChildProcess[] = [];
  let active: ChildProcess | undefined, killed = false, left = false, preserved = 0;
  const samples = [], started = Date.now();
  const minutes = Math.max(6, Math.min(30, Number(process.env.SUBTITLE_TEST_MINUTES) || 20));
  for (let i = 0; i < 2; i++) {
    const child = spawn(process.execPath, ["--import", "tsx", resolve("tests/integration/zju-subtitles-replay-worker.ts")], {
      env: { ...process.env, ZJU_SUBTITLE_MAX_LESSON_MINUTES: String(minutes), ZJU_SUBTITLE_SESSION_SECONDS: "60" }, stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    child.stdout!.on("data", data => { for (const line of data.toString().trim().split("\n")) { try { const event = JSON.parse(line); if (event.claimed) active = child; } catch {} } });
    child.stderr!.on("data", () => console.error("Integration worker reported an error; inspect the saved task state."));
  }
  try {
    for (let tick = 0; tick < minutes * 5 + 10; tick++) {
      await Promise.all(users.map((u, i) => heartbeatLiveSubtitles(u.userId, identity, clients[i])));
      const [a, b] = await Promise.all(users.map(u => readLiveSubtitles(u.userId, identity)));
      assert.ok(a && b); assert.equal(a.id, b.id);
      if (a.revision === b.revision) assert.deepEqual(a.cues, b.cues);
      const state = await prisma.zjuLiveSubtitle.findUniqueOrThrow({ where: { id: row.id } });
      const sample = { elapsedMs: Date.now() - started, status: state.status, audioMs: state.audioMs, generation: state.generation, cues: a.cues.length,
        activeTasks: await prisma.zjuLiveSubtitle.count({ where: { status: "running", leaseUntil: { gt: new Date() } } }) };
      assert.ok(sample.activeTasks <= 1); samples.push(sample); console.log(JSON.stringify(sample));
      if (!killed && state.audioMs >= 300000 && active) { preserved = a.cues.length; active.kill("SIGKILL"); killed = true; }
      if (killed && state.generation >= 2) assert.ok(a.cues.length >= preserved);
      if (!left && state.audioMs >= 420000) { await leaveLiveSubtitles(users[0].userId, identity, clients[0]); left = true; }
      await writeFile(process.env.SUBTITLE_TEST_REPORT || "/tmp/zju-subtitles-replay-report.json", JSON.stringify({ source: "same-lesson classroom replay", users: 2, killedWorker: killed, oneViewerLeft: left, cuesBeforeRestart: preserved, samples }, null, 2));
      if (["limited", "completed", "failed"].includes(state.status)) {
        assert.notEqual(state.status, "failed"); assert.ok(state.audioMs >= minutes * 60000 - 2000); assert.ok(a.cues.length > 0); assert.ok(state.generation >= 2); return;
      }
      await new Promise(r => setTimeout(r, 15000));
    }
    throw new Error("Long-running integration test exceeded its deadline.");
  } finally { for (const child of children) if (child.exitCode === null) child.kill("SIGTERM"); }
}
void main().catch(() => { console.error("Paid subtitle integration test failed; check the isolated database and report."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
