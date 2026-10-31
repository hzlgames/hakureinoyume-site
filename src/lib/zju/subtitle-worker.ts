import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import prisma from "../prisma";
import { getLiveApi } from "./live";
import { transcribeLive, type AsrEvent } from "./asr/stream.mjs";
import { createClassroomAudio } from "./subtitle-audio";
import { audioToMedia, SUBTITLE_TTL_MS, VIEWER_TTL_MS, IDLE_GRACE_MS, type AudioAnchor } from "./subtitle-core";
import { isClassroomStream } from "./subtitles";

const LEASE_MS = 20000;
const configInt = (key: string, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number(process.env[key]) || fallback));
export async function loadSubtitleKey() {
  if (process.env.DOUBAO_ASR_API_KEY) return process.env.DOUBAO_ASR_API_KEY;
  if (process.env.DOUBAO_ASR_KEY_ENV) {
    const values = parse(await readFile(process.env.DOUBAO_ASR_KEY_ENV));
    if (values.DOUBAO_ASR_API_KEY || values.API_KEY) return values.DOUBAO_ASR_API_KEY || values.API_KEY;
  }
  throw new Error("服务端未配置火山引擎字幕密钥。");
}
export async function claimSubtitle(owner: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(876012034)`;
    const now = new Date();
    const max = configInt("ZJU_SUBTITLE_MAX_CONCURRENT", 2, 1, 8);
    if (await tx.zjuLiveSubtitle.count({ where: { status: "running", leaseUntil: { gt: now } } }) >= max) return null;
    const row = await tx.zjuLiveSubtitle.findFirst({ where: {
      expiresAt: { gt: now }, attempts: { lt: 4 },
      OR: [{ status: "queued" }, { status: "running", leaseUntil: { lt: now } }],
      viewers: { some: { lastSeenAt: { gt: new Date(Date.now() - VIEWER_TTL_MS) } } }
    }, orderBy: { createdAt: "asc" } });
    if (!row) return null;
    return tx.zjuLiveSubtitle.update({ where: { id: row.id }, data: {
      status: "running", leaseOwner: owner, leaseUntil: new Date(Date.now() + LEASE_MS), generation: { increment: 1 },
      attempts: { increment: 1 }, startedAt: row.startedAt ?? now, partial: "", partialStartMs: null, partialEndMs: null, error: row.generation > 0 ? "识别已恢复，重连附近可能存在字幕缺口。" : null
    } });
  });
}
export async function cleanupLiveSubtitles(now = new Date()) {
  const removed = await prisma.zjuLiveSubtitle.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.zjuLiveSubtitleViewer.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - IDLE_GRACE_MS - VIEWER_TTL_MS) } } });
  await prisma.zjuLiveSubtitle.updateMany({ where: { status: "running", leaseUntil: { lt: now }, attempts: { gte: 4 } }, data: { status: "failed", leaseOwner: null, leaseUntil: null, error: "识别恢复次数已达上限。", finishedAt: now } });
  await prisma.zjuLiveSubtitle.updateMany({ where: { status: "queued", viewers: { none: { lastSeenAt: { gt: new Date(now.getTime() - VIEWER_TTL_MS) } } } }, data: { status: "idle", attempts: 0 } });
  return removed.count;
}
export async function runClaimedSubtitle(row: NonNullable<Awaited<ReturnType<typeof claimSubtitle>>>, apiKey: string, parentSignal: AbortSignal, sourceFactory: typeof createClassroomAudio = createClassroomAudio) {
  const ctrl = new AbortController(); const signal = ctrl.signal;
  const abort = () => ctrl.abort(); parentSignal.addEventListener("abort", abort, { once: true });
  if (parentSignal.aborted) ctrl.abort();
  const fence = { id: row.id, leaseOwner: row.leaseOwner, generation: row.generation, status: "running" };
  let status = "idle", message: string | null = null, noViewersSince: number | null = null, heartbeatBusy = false;
  const seen = new Map<string, string>();
  let sourceUser = "", lastPartialAt = 0, lastSession = 0, finalAudioMs = row.audioMs;
  const renew = async () => {
    if (heartbeatBusy || signal.aborted) return; heartbeatBusy = true;
    try {
      const updated = await prisma.zjuLiveSubtitle.updateMany({ where: fence, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
      if (!updated.count) { ctrl.abort(); return; }
      const viewers = await prisma.zjuLiveSubtitleViewer.count({ where: { subtitleId: row.id, lastSeenAt: { gt: new Date(Date.now() - VIEWER_TTL_MS) } } });
      if (viewers) noViewersSince = null;
      else noViewersSince ??= Date.now();
      if (noViewersSince !== null && Date.now() - noViewersSince > IDLE_GRACE_MS) ctrl.abort();
    } catch { ctrl.abort(); } finally { heartbeatBusy = false; }
  };
  const timer = setInterval(() => void renew(), 5000);
  const resolveUrl = async () => {
    const viewers = await prisma.zjuLiveSubtitleViewer.findMany({ where: { subtitleId: row.id, lastSeenAt: { gt: new Date(Date.now() - IDLE_GRACE_MS) } }, orderBy: { lastSeenAt: "desc" }, select: { userId: true } });
    const candidates = [...new Set([sourceUser, ...viewers.map(v => v.userId)].filter(Boolean))];
    for (const userId of candidates) {
      try {
        const api = await getLiveApi(userId);
        const lesson = (await api.lessons(row.courseId, true, signal)).find(l => l.subId === row.subId);
        if (lesson && lesson.status !== "1") { status = "completed"; ctrl.abort(); throw new DOMException("直播已结束", "AbortError"); }
        if (lesson?.status !== "1") continue;
        const stream = (await api.streams(row.subId, row.courseId, lesson.type)).find(isClassroomStream);
        if (!stream) continue;
        const media = new URL(stream.url);
        if (!/\.cmc\.zju\.edu\.cn$/.test(media.hostname)) throw new Error("教室音源域名不受支持。");
        sourceUser = userId; return stream.url;
      } catch (e) { if (signal.aborted) throw e; }
    }
    throw new Error("没有可访问此课节的有效 ZJU 账号。");
  };
  const maxTotal = configInt("ZJU_SUBTITLE_MAX_LESSON_MINUTES", 240, 1, 480) * 60000;
  const runId = randomUUID();
  const source = sourceFactory({ resolveUrl, signal, lastSequence: row.lastSequence, timelineMs: row.timelineMs, audioBaseMs: row.audioMs,
    maxAudioMs: Math.max(0, maxTotal - row.audioMs),
    onSegment: async (segment, startMs, audioEndMs, observedAt, gap) => {
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(876012035)`;
        await tx.$queryRaw`SELECT id FROM "ZjuLiveSubtitle" WHERE id = ${row.id} FOR UPDATE`;
        const current = await tx.zjuLiveSubtitle.findFirst({ where: fence });
        if (!current || !current.leaseUntil || current.leaseUntil <= new Date()) throw new Error("字幕任务租约已失效。");
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
        const used = await tx.zjuLiveSubtitleDailyUsage.upsert({ where: { day }, create: { day }, update: {} });
        const delta = Math.round(audioEndMs - finalAudioMs);
        if (used.audioMs + delta > configInt("ZJU_SUBTITLE_DAILY_MINUTES", 120, 1, 14400) * 60000) { status = "limited"; throw new Error("今日字幕音频预算已用完。"); }
        await tx.zjuLiveSubtitleDailyUsage.update({ where: { day }, data: { audioMs: { increment: delta } } });
        await tx.zjuLiveSubtitleSegment.upsert({ where: { subtitleId_sequence: { subtitleId: row.id, sequence: segment.sequence } },
          create: { subtitleId: row.id, sequence: segment.sequence, startMs, durationMs: Math.round(segment.durationMs), observedAt }, update: {} });
        await tx.zjuLiveSubtitle.update({ where: { id: row.id }, data: { billedAudioMs: { increment: delta },
          audioMs: Math.round(audioEndMs), lastSequence: segment.sequence, timelineMs: Math.round(startMs + segment.durationMs), ...(gap ? { error: "直播中断期间有音频缺口。" } : {}) } });
        finalAudioMs = audioEndMs;
      });
    }
  });
  try {
    if (row.audioMs >= maxTotal) { status = "limited"; message = "该课节识别已达到时长上限。"; return; }
    const seconds = configInt("ZJU_SUBTITLE_SESSION_SECONDS", 300, 10, 600);
    for await (const event of transcribeLive({ apiKey, signal, audio: source.audio, sessionSeconds: seconds,
      duration: (maxTotal - row.audioMs) / 1000, resourceId: process.env.DOUBAO_ASR_STREAM_RESOURCE_ID || "volc.seedasr.sauc.duration", uid: row.id,
      request: { enable_nonstream: true, show_utterances: true, result_type: "full" } })) {
      if (event.type !== "response" || !event.result) continue;
      lastSession = event.session ?? lastSession;
      const changed = event.result.utterances?.filter(u => u.definite && seen.get(`${event.session}:${u.start_time ?? 0}`) !== JSON.stringify(u)) ?? [];
      const hasDefinite = changed.length > 0;
      if (!hasDefinite && !event.final && Date.now() - lastPartialAt < 750) continue;
      const incoming = { ...event, result: { ...event.result, utterances: [...changed, ...(event.result.utterances?.filter(u => !u.definite) ?? [])] } };
      await persistSubtitleResponse(fence, runId, row.audioMs, incoming, source.anchors);
      for (const u of changed) seen.set(`${event.session}:${u.start_time ?? 0}`, JSON.stringify(u));
      lastPartialAt = Date.now();
    }
    if (!signal.aborted && status !== "completed") { status = finalAudioMs >= maxTotal ? "limited" : "completed"; }
  } catch (error) {
    if (!signal.aborted) {
      if (status !== "limited") status = !(error as { fatal?: boolean }).fatal && row.attempts < 4 ? "queued" : "failed";
      // Media URLs, headers, keys and upstream raw responses are never stored as error messages.
      message = status === "limited" ? "今日字幕音频预算已用完。" : "直播识别中断，请稍后重试或检查后台日志。";
      console.error("Live subtitle worker failed", { lesson: row.lessonKey, generation: row.generation, session: lastSession, kind: error instanceof Error ? error.name : "unknown", code: (error as { code?: string }).code });
    }
  } finally {
    clearInterval(timer); ctrl.abort(); parentSignal.removeEventListener("abort", abort);
    await prisma.zjuLiveSubtitle.updateMany({ where: fence, data: { status, ...(status === "idle" ? { attempts: 0 } : {}), ...(message ? { error: message } : {}), partial: "", partialStartMs: null, partialEndMs: null, leaseOwner: null, leaseUntil: null,
      finishedAt: new Date(), expiresAt: status === "completed" ? new Date(Date.now() + SUBTITLE_TTL_MS) : row.expiresAt } });
  }
}
export async function persistSubtitleResponse(fence: { id: string; leaseOwner: string | null; generation: number; status: string }, runId: string, audioBase: number, event: AsrEvent, anchors: AudioAnchor[]) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ZjuLiveSubtitle" WHERE id = ${fence.id} FOR UPDATE`;
    const current = await tx.zjuLiveSubtitle.findFirst({ where: fence });
    if (!current || !current.leaseUntil || current.leaseUntil <= new Date()) throw new Error("字幕任务租约已失效。");
    const revision = current.revision + 1;
    for (const u of event.result?.utterances ?? []) {
      if (!u.definite || !u.text?.trim() || !Number.isFinite(u.end_time)) continue;
      const begin = Math.max(0, u.start_time ?? 0), end = u.end_time!;
      if (end < begin) continue;
      const offset = audioBase + (event.offsetMs ?? 0);
      const startMs = audioToMedia(offset + begin, anchors), endMs = audioToMedia(offset + end, anchors);
      const key = `${runId}:${event.session ?? 1}:${begin}`;
      await tx.zjuLiveSubtitleCue.upsert({ where: { subtitleId_key: { subtitleId: fence.id, key } },
        create: { subtitleId: fence.id, key, startMs, endMs, text: u.text.trim(), revision },
        update: { startMs, endMs, text: u.text.trim(), revision } });
    }
    const temporary = (event.result?.utterances ?? []).filter(u => !u.definite && u.text?.trim());
    const partial = temporary.map(u => u.text).join("").slice(-300);
    const offset = audioBase + (event.offsetMs ?? 0);
    const begin = temporary[0]?.start_time ?? 0;
    const end = temporary.at(-1)?.end_time ?? event.audioSentMs ?? begin;
    const partialStartMs = partial ? audioToMedia(offset + Math.max(0, begin), anchors) : null;
    const partialEndMs = partial ? audioToMedia(offset + Math.max(begin, end), anchors) : null;
    await tx.zjuLiveSubtitle.update({ where: { id: fence.id }, data: { revision, partial, partialStartMs, partialEndMs } });
  });
}
export async function runSubtitleWorker(signal: AbortSignal) {
  const apiKey = await loadSubtitleKey();
  const tasks = new Map<string, Promise<void>>(); let nextCleanup = 0;
  while (!signal.aborted) {
    if (Date.now() > nextCleanup) { await cleanupLiveSubtitles(); nextCleanup = Date.now() + 60000; }
    const owner = randomUUID(); const row = await claimSubtitle(owner);
    if (row) {
      const task = runClaimedSubtitle(row, apiKey, signal).catch(() => console.error("Live subtitle task stopped unexpectedly")).finally(() => tasks.delete(owner));
      tasks.set(owner, task);
    }
    await new Promise<void>(resolve => { const timer = setTimeout(done, 1000); function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); } signal.addEventListener("abort", done, { once: true }); if (signal.aborted) done(); });
  }
  await Promise.allSettled(tasks.values());
}
