import { createHash } from "node:crypto";
import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { buildClassroomClient, toJsonValue } from "./shared";
import { activeJobs, createJobLogger } from "./jobs";
import { createLiveApi, scanLive } from "./live-core";

// Bounded, account-isolated directory caches; every request rechecks saved credentials.
const sessions = new Map<string, { key: string; expires: number; api: Promise<ReturnType<typeof createLiveApi>> }>();
export async function getLiveApi(userId: string) {
  const secret = await getZjuSecret(userId);
  const key = createHash("sha256").update(JSON.stringify([secret.username, secret.password])).digest("hex");
  const hit = sessions.get(userId);
  if (hit?.key === key && hit.expires > Date.now()) return hit.api;
  const api = buildClassroomClient(secret).then(client => {
    let initialized = false;
    let initializing: Promise<void> | undefined;
    return createLiveApi({ async fetch(url, init) {
      if (initializing) await initializing;
      init?.signal?.throwIfAborted();
      if (initialized) return client.fetch(url, init);
      const pending = client.fetch(url, init);
      initializing = pending.then(() => { initialized = true; }, () => undefined);
      try { return await pending; } finally { initializing = undefined; }
    } });
  });
  if (sessions.size >= 50) sessions.delete(sessions.keys().next().value!);
  sessions.set(userId, { key, expires: Date.now() + 300000, api });
  try { return await api; } catch (error) { sessions.delete(userId); throw error; }
}
export async function createLiveScanJob(userId: string) {
  const job = await prisma.zjuToolJob.create({ data: { userId, tool: "classroom.zju/live-scan", status: "queued", input: {} } });
  void runLiveScan(job.id, userId);
  return job;
}
async function runLiveScan(jobId: string, userId: string) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const logger = createJobLogger(jobId);
  try {
    await prisma.zjuToolJob.update({ where: { id: jobId }, data: { status: "running", startedAt: new Date() } });
    logger.log("正在检测我的课程直播…");
    const result = await scanLive(await getLiveApi(userId), { signal: abort.signal, refresh: true, progress: (n, total) => logger.log(`已检测 ${n} / ${total} 门课程`) });
    abort.signal.throwIfAborted();
    logger.log(`发现 ${result.live.length} 节直播；${result.failed.length} 门课程检测失败。`);
    await logger.flush();
    await prisma.zjuToolJob.updateMany({ where: { id: jobId, status: "running" }, data: { status: "succeeded", output: toJsonValue(result), exitCode: 0, finishedAt: new Date() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检测失败。";
    logger.log(abort.signal.aborted ? "任务已取消。" : message);
    await logger.flush();
    await prisma.zjuToolJob.updateMany({ where: { id: jobId, status: { in: ["running", "queued"] } }, data: { status: abort.signal.aborted ? "cancelled" : "failed", error: abort.signal.aborted ? null : message, finishedAt: new Date() } });
  } finally { activeJobs.delete(jobId); }
}
