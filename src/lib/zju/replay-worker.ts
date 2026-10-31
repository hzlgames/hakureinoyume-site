import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import prisma from "../prisma";
import type { Prisma, ZjuReplayTranscript } from "../../generated/prisma/client";
import { ASR_QUEUE_LOCK, asrConcurrency, reserveAsrBudget, AsrBudgetError } from "./asr-budget";
import { loadSubtitleKey } from "./subtitle-worker";
import { authorizeReplay, synchronizeReplayJobs } from "./replay-transcripts";
import { replayDuration, replayPcm } from "./replay-media";
import { pollRecording, submitRecording, recordingExports, RECORDING_RESOURCE, type RecordingCue } from "./asr/recording";
import { exportReplayTranscriptJobs } from "./replay-exports";
import { pauseAlignedPcm, REPLAY_OVERLAP_MS, mergeReplayCues } from "./replay-chunks";
const ACTIVE = ["queued","running"];
const LEASE_MS = 30000;
export async function claimReplay(owner: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ASR_QUEUE_LOCK})`;
    const now = new Date();
    const [live, replay] = await Promise.all([tx.zjuLiveSubtitle.count({ where: { status: "running", leaseUntil: { gt: now } } }),tx.zjuReplayTranscript.count({ where: { status: "running", leaseUntil: { gt: now } } })]);
    if (live + replay >= asrConcurrency()) return null;
    const row = await tx.zjuReplayTranscript.findFirst({ where: { OR: [{ status: "queued" },{ status: "succeeded" },{ status: "running", leaseUntil: { lt: now } }], jobs: { some: { status: { in: ACTIVE } } } }, orderBy: { createdAt: "asc" } });
    if (!row) return null;
    return tx.zjuReplayTranscript.update({ where: { id: row.id }, data: { status: "running", generation: { increment: 1 }, leaseOwner: owner, leaseUntil: new Date(Date.now()+LEASE_MS), error: null } });
  });
}
function fence(row: ZjuReplayTranscript) { return { id: row.id, status: "running", generation: row.generation, leaseOwner: row.leaseOwner, leaseUntil: { gt: new Date() } }; }
async function lockedReplay(tx: Prisma.TransactionClient, row: ZjuReplayTranscript) {
  await tx.$queryRaw`SELECT id FROM "ZjuReplayTranscript" WHERE id = ${row.id} FOR UPDATE`;
  const current = await tx.zjuReplayTranscript.findFirst({ where: fence(row) });
  if (!current) throw new DOMException("转录已停止或租约失效。", "AbortError");
  return current;
}
export async function prepareReplayChunk(row: ZjuReplayTranscript, durationMs: number, audioStartMs = row.processedMs) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ASR_QUEUE_LOCK})`;
    const current = await lockedReplay(tx,row);
    if (audioStartMs < 0 || audioStartMs > current.processedMs || current.processedMs-audioStartMs > REPLAY_OVERLAP_MS || audioStartMs+durationMs <= current.processedMs) throw new Error("音频分段时间无效。 ");
    const jobs = await tx.zjuToolJob.findMany({ where: { replayTranscriptId: row.id, status: { in: ACTIVE } }, select: { user: { select: { asrQuotaExempt: true } } } });
    if (!jobs.length) throw new DOMException("转录已中止。", "AbortError");
    const existing = await tx.zjuReplayTranscriptChunk.findUnique({ where: { transcriptId_startMs: { transcriptId: row.id, startMs: current.processedMs } } });
    if (existing) return { chunk: existing, shouldSubmit: false };
    await reserveAsrBudget(tx,durationMs,jobs.some(j=>j.user.asrQuotaExempt));
    // Durable request id and conservative charge precede the network side effect.
    const chunk = await tx.zjuReplayTranscriptChunk.create({ data: { transcriptId: row.id, startMs: current.processedMs, audioStartMs, durationMs, requestId: randomUUID(), resourceId: process.env.DOUBAO_ASR_RESOURCE_ID || RECORDING_RESOURCE } });
    return { chunk, shouldSubmit: true };
  });
}
export async function commitReplayChunk(row: ZjuReplayTranscript, chunkId: string, cues: RecordingCue[]) {
  return prisma.$transaction(async tx => {
    await lockedReplay(tx,row);
    const chunk = await tx.zjuReplayTranscriptChunk.findFirstOrThrow({ where: { id: chunkId, transcriptId: row.id } });
    await tx.zjuReplayTranscriptChunk.update({ where: { id: chunkId }, data: { status: "succeeded", cues: cues as Prisma.InputJsonValue } });
    const all = await tx.zjuReplayTranscriptChunk.findMany({ where: { transcriptId: row.id, status: "succeeded" }, orderBy: { startMs: "asc" } });
    const exports = recordingExports(mergeReplayCues(all.map(c=>({ startMs: c.startMs, audioStartMs: c.audioStartMs, cues: c.cues as RecordingCue[] ?? [] }))));
    return tx.zjuReplayTranscript.update({ where: { id: row.id }, data: { processedMs: chunk.audioStartMs+chunk.durationMs, ...exports } });
  });
}
export type ReplayDependencies = { duration: typeof replayDuration; pcm: typeof replayPcm; submit: typeof submitRecording; poll: typeof pollRecording; export: (row: ZjuReplayTranscript, signal: AbortSignal) => Promise<void>; resolve: (row: ZjuReplayTranscript, signal: AbortSignal) => Promise<string> };
const defaults: ReplayDependencies = { duration: replayDuration, pcm: replayPcm, submit: submitRecording, poll: pollRecording, export: exportReplayTranscriptJobs, resolve: async (row, signal) => {
  const jobs = await prisma.zjuToolJob.findMany({ where: { replayTranscriptId: row.id, status: { in: ACTIVE } }, select: { userId: true }, orderBy: { createdAt: "asc" } });
  for (const {userId} of jobs) {
    signal.throwIfAborted();
    try { const lesson = await authorizeReplay(userId,row.courseId,row.subId); signal.throwIfAborted(); return lesson.playbackUrl!; } catch { signal.throwIfAborted(); }
  }
  throw new Error("没有可访问此回放的有效请求者，请重新验证 ZJU 账号。");
} };
export async function runClaimedReplay(initial: ZjuReplayTranscript, apiKey: string, parent: AbortSignal, dependencies: ReplayDependencies = defaults) {
  let row = initial, busy = false, error: string | null = null, outcome = "queued";
  const abort = new AbortController(), signal = abort.signal;
  const stop = () => abort.abort(); parent.addEventListener("abort",stop,{once:true}); if (parent.aborted) stop();
  const renew = async () => {
    if (busy || signal.aborted) return; busy = true;
    try {
      const updated = await prisma.zjuReplayTranscript.updateMany({ where: { ...fence(row), jobs: { some: { status: { in: ACTIVE } } } }, data: { leaseUntil: new Date(Date.now()+LEASE_MS) } });
      if (!updated.count) abort.abort();
    } catch { abort.abort(); } finally { busy = false; }
  };
  const timer = setInterval(()=>void renew(),1000);
  try {
    if (!row.durationMs) {
      const url = await dependencies.resolve(row,signal); signal.throwIfAborted();
      const durationMs = await dependencies.duration(url,signal);
      const updated = await prisma.zjuReplayTranscript.updateMany({ where: fence(row), data: { durationMs } });
      if (!updated.count) throw new DOMException("转录已中止。","AbortError");
      row = { ...row, durationMs };
    }
    await synchronizeReplayJobs(row);
    while (row.processedMs < row.durationMs-100) {
      signal.throwIfAborted();
      const pending = await prisma.zjuReplayTranscriptChunk.findUnique({ where: { transcriptId_startMs: { transcriptId: row.id, startMs: row.processedMs } } });
      let chunk = pending;
      if (!chunk) {
        // Resolve a fresh authorized URL for every chunk; never persist signed URLs.
        const url = await dependencies.resolve(row,signal); signal.throwIfAborted();
        const audioStartMs = Math.max(0,row.processedMs-REPLAY_OVERLAP_MS);
        let pcm: Buffer | null = await dependencies.pcm(url,audioStartMs,Math.min(60000,row.durationMs-audioStartMs),signal);
        const original = pcm;
        pcm = pauseAlignedPcm(pcm,audioStartMs+pcm.length/32 >= row.durationMs-100);
        const durationMs = Math.round(pcm.length/32);
        if (durationMs <= 0 || durationMs > 60000) throw new Error("解码音频时长无效。");
        try {
          signal.throwIfAborted();
          const prepared = await prepareReplayChunk(row,durationMs,audioStartMs); chunk = prepared.chunk;
          // Aborting after the reservation leaves a queryable id, never a blind paid retry.
          signal.throwIfAborted();
          if (prepared.shouldSubmit) await dependencies.submit({ apiKey, requestId: chunk.requestId, resourceId: chunk.resourceId, pcm, signal, context: `${row.title.slice(0,64)}
${row.txt.replace(/^\ufeff/,"").slice(-256)}` });
        } finally { original.fill(0); pcm = null; }
      }
      signal.throwIfAborted();
      const result = await dependencies.poll({ apiKey, requestId: chunk!.requestId, resourceId: chunk!.resourceId, durationMs: chunk!.durationMs, signal });
      row = await commitReplayChunk(row,chunk!.id,result.cues);
      await synchronizeReplayJobs(row);
      // Small differences between container duration and decoded PCM are common.
      if (row.durationMs - row.processedMs < 100) break;
    }
    await dependencies.export(row,signal);
    outcome = "succeeded";
  } catch (e) {
    if (!signal.aborted && !(e instanceof Error && e.name === "AbortError")) {
      outcome = e instanceof AsrBudgetError ? "limited" : "failed";
      error = e instanceof Error && /^(今日|火山引擎|当前分段|没有可访问|音频|回放|解码|识别结果|无法启动|无法确认)/.test(e.message) ? e.message : "转录暂时中断。已完成分段保留；重新导出会查询原任务，避免重复提交计费。";
    }
  } finally {
    clearInterval(timer); abort.abort(); parent.removeEventListener("abort",stop);
    const updated = await prisma.zjuReplayTranscript.updateMany({ where: { id: row.id, status: "running", leaseOwner: row.leaseOwner, generation: row.generation }, data: { status: outcome, error, leaseOwner: null, leaseUntil: null } });
    if (updated.count) await synchronizeReplayJobs(await prisma.zjuReplayTranscript.findUniqueOrThrow({ where: { id: row.id } }));
  }
}
export async function runReplayWorker(signal: AbortSignal) {
  const apiKey = await loadSubtitleKey();
  while (!signal.aborted) {
    const row = await claimReplay(randomUUID());
    if (row) await runClaimedReplay(row,apiKey,signal);
    if (!signal.aborted) await sleep(1000,undefined,{signal}).catch(()=>{});
  }
}
