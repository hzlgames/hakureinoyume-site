import prisma from "../prisma";
import { ASR_QUEUE_LOCK } from "./asr-budget";
import { authorizeSubtitleLesson } from "./subtitles";
import { lessonKey } from "./subtitle-core";
import { toJsonValue } from "./shared";
import type { ZjuReplayTranscript } from "../../generated/prisma/client";
export const REPLAY_FILES = { srt: "课堂字幕.srt", txt: "课堂转写.txt" } as const;
export async function authorizeReplay(userId: string, courseId: string, subId: string) {
  const lesson = await authorizeSubtitleLesson(userId, { courseId, subId });
  if (lesson.status !== "6" || !lesson.playbackUrl) throw new Error("该课节尚无可访问的课堂回放。");
  return lesson;
}
export function replayOutput(row: Pick<ZjuReplayTranscript,"processedMs"|"durationMs"|"status"|"srt"|"txt">) {
  return toJsonValue({ provider: "volcengine", persistent: true, processedMs: row.processedMs, durationMs: row.durationMs, partial: row.status !== "succeeded", files: row.processedMs > 0 ? Object.entries(REPLAY_FILES).map(([key,name]) => ({ name, size: Buffer.byteLength(row[key as "srt"|"txt"],"utf8") })) : [] });
}
export async function createReplayTranscriptJob(input: { userId: string; courseId: string; subId: string }, authorize = authorizeReplay) {
  const lesson = await authorize(input.userId, input.courseId, input.subId);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ASR_QUEUE_LOCK})`;
    let row = await tx.zjuReplayTranscript.upsert({ where: { lessonKey: `replay:${lessonKey(input)}` }, create: { lessonKey: `replay:${lessonKey(input)}`, courseId: input.courseId, subId: input.subId, title: lesson.title }, update: {} });
    const existing = await tx.zjuToolJob.findFirst({ where: { replayTranscriptId: row.id, userId: input.userId, status: { in: ["queued","running"] } }, orderBy: { createdAt: "desc" } });
    if (existing) return existing;
    if (row.status !== "succeeded" && !(row.status === "running" && row.leaseUntil && row.leaseUntil > new Date())) row = await tx.zjuReplayTranscript.update({ where: { id: row.id }, data: { status: "queued", error: null } });
    return tx.zjuToolJob.create({ data: { userId: input.userId, replayTranscriptId: row.id, tool: "classroom.zju/transcript", status: row.status === "succeeded" ? "succeeded" : "queued", input: toJsonValue({ courseId: input.courseId, subId: input.subId, provider: "volcengine", title: row.title }), output: replayOutput(row), logs: row.status === "succeeded" ? "已复用服务器保存的火山引擎字幕，无需再次识别。" : "已加入该课节的共享转录；只提交教室音轨，最多一分钟一个分段。", ...(row.status === "succeeded" ? { finishedAt: new Date(), exitCode: 0 } : {}) } });
  });
}
export async function cancelReplayJob(userId: string, jobId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ASR_QUEUE_LOCK})`;
    const job = await tx.zjuToolJob.findFirst({ where: { id: jobId, userId, replayTranscriptId: { not: null } } });
    if (!job) return false;
    await tx.zjuToolJob.updateMany({ where: { id: jobId, status: { in: ["queued","running"] } }, data: { status: "cancelled", finishedAt: new Date(), logs: "已中止自己的转录请求。无其他请求者时停止后台；已提交的当前分段（最多一分钟）仍可能计费。已确定字幕保留，可稍后继续。" } });
    // Serializes with join and the last check before submitting a paid chunk.
    const active = await tx.zjuToolJob.count({ where: { replayTranscriptId: job.replayTranscriptId, status: { in: ["queued","running"] } } });
    if (!active) await tx.zjuReplayTranscript.updateMany({ where: { id: job.replayTranscriptId!, status: { in: ["queued","running"] } }, data: { status: "idle", leaseOwner: null, leaseUntil: null } });
    return true;
  });
}
export async function synchronizeReplayJobs(row: ZjuReplayTranscript) {
  const failed = ["failed","limited"].includes(row.status), succeeded = row.status === "succeeded";
  await prisma.zjuToolJob.updateMany({ where: { replayTranscriptId: row.id, status: { in: ["queued","running"] } }, data: {
    status: succeeded ? "succeeded" : failed ? "failed" : "running", output: replayOutput(row), error: row.error,
    logs: `火山引擎共享回放转录：${row.title}\n已保存 ${Math.floor(row.processedMs/60000)} 分 ${Math.floor(row.processedMs/1000)%60} 秒 / ${Math.ceil(row.durationMs/60000)} 分钟。\n字幕长期保存；中止后最多保留当前已提交的一分钟云端计费。${row.error ? "\n"+row.error : ""}`,
    ...(succeeded || failed ? { finishedAt: new Date(), exitCode: succeeded ? 0 : 1 } : { startedAt: new Date() })
  } });
}
