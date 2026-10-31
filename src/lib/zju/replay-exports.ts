import fs from "node:fs/promises";
import prisma from "../prisma";
import type { Prisma, ZjuReplayTranscript } from "../../generated/prisma/client";
import { getZjuSecret } from "./account";
import { buildClassroomTranscript, type ClassroomExportOptions } from "./classroom-export";
import { asRecord, buildClassroomClient, getZjuDataRoot, pathSegment, toJsonValue } from "./shared";
import { mergeReplayCues } from "./replay-chunks";
import { replayOutput, REPLAY_FILES } from "./replay-transcripts";
import type { RecordingCue } from "./asr/recording";

type ExportDependencies = {
  client: (userId: string) => Promise<ClassroomExportOptions["client"]>;
  root: string;
};
const defaults: ExportDependencies = { client: async userId => buildClassroomClient(await getZjuSecret(userId)), root: getZjuDataRoot() };
export async function exportReplayTranscriptJobs(row: ZjuReplayTranscript, parent: AbortSignal, dependencies = defaults) {
  const chunks = await prisma.zjuReplayTranscriptChunk.findMany({ where: { transcriptId: row.id, status: "succeeded" }, orderBy: { startMs: "asc" } });
  const subtitles = mergeReplayCues(chunks.map(c => ({ startMs: c.startMs, audioStartMs: c.audioStartMs, cues: c.cues as RecordingCue[] ?? [] }))).map(c => ({ beginSec: c.startMs/1000, text: c.text }));
  for (;;) {
    parent.throwIfAborted();
    const job = await prisma.zjuToolJob.findFirst({ where: { replayTranscriptId: row.id, status: { in: ["queued","running"] } }, orderBy: { createdAt: "asc" } });
    if (!job) return;
    const abort = new AbortController(), signal = AbortSignal.any([parent, abort.signal]);
    // Different generations never overwrite each other's partially written package.
    const workDir = `${dependencies.root}/${pathSegment(job.userId)}/${pathSegment(job.id)}/g-${row.generation}`;
    const owned = (): Prisma.ZjuToolJobWhereInput => ( { id: job.id, status: { in: ["queued","running"] }, replayTranscript: { status: "running", generation: row.generation, leaseOwner: row.leaseOwner, leaseUntil: { gt: new Date() } } });
    let saved = false, checking = false;
    const check = async () => {
      if (checking) return; checking = true;
      try { if (!await prisma.zjuToolJob.count({ where: { id: job.id, status: { in: ["queued","running"] } } })) abort.abort(); }
      catch { abort.abort(); } finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 1000);
    try {
      const started = await prisma.zjuToolJob.updateMany({ where: owned(), data: { status: "running", startedAt: new Date(), logs: "火山字幕已保存，正在按智云原流程下载 PPT 并导出 Markdown / ZIP，无需再次识别。" } });
      if (!started.count) { await check(); if (abort.signal.aborted) continue; throw new DOMException("导出租约已失效。", "AbortError"); }
      const client = await dependencies.client(job.userId); signal.throwIfAborted();
      const output = await buildClassroomTranscript({ client, courseId: row.courseId, subId: row.subId, title: row.title, workDir, signal, log: () => {}, subtitles, textFiles: { [REPLAY_FILES.srt]: row.srt, [REPLAY_FILES.txt]: row.txt } });
      signal.throwIfAborted();
      const persistent = asRecord(replayOutput(row));
      const updated = await prisma.zjuToolJob.updateMany({ where: owned(), data: { status: "succeeded", finishedAt: new Date(), exitCode: 0, workDir, error: null, output: toJsonValue({ ...persistent, ...output, files: [...output.files, ...(persistent.files as unknown[])] }), logs: "已按智云原流程导出 PPT + Markdown / ZIP，文档字幕使用火山转写。压缩包内含 SRT / TXT；字幕长期保存，压缩包保留两天，到期可复用字幕重新打包，无需再次识别。" } });
      saved = updated.count > 0;
      if (!saved) { await check(); parent.throwIfAborted(); if (!abort.signal.aborted) throw new DOMException("导出租约已失效。", "AbortError"); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && !abort.signal.aborted) throw error;
      if (!parent.aborted && !abort.signal.aborted) await prisma.zjuToolJob.updateMany({ where: owned(), data: { status: "failed", finishedAt: new Date(), exitCode: 1, error: "PPT / Markdown 打包未完成。火山字幕已保存，可重新导出复用，无需再次识别。" } });
      parent.throwIfAborted();
    } finally { clearInterval(timer); if (!saved) await fs.rm(workDir, { recursive: true, force: true }); }
  }
}
