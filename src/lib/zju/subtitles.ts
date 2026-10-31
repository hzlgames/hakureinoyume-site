import prisma from "../prisma";
import { getLiveApi } from "./live";
import type { LiveLesson } from "./live-core";
import { lessonKey, SUBTITLE_TTL_MS, VIEWER_TTL_MS, type SubtitleIdentity, type SubtitleSnapshot } from "./subtitle-core";

const access = new Map<string, { until: number; lesson: LiveLesson; api: Awaited<ReturnType<typeof getLiveApi>> }>();
export function validSubtitleClient(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(value); }
export async function verifySubtitleMediaAccess(url: string) {
  const parsed = new URL(url);
  if (!/\.cmc\.zju\.edu\.cn$/.test(parsed.hostname)) throw new Error("课节媒体来源无效。");
  const response = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(15000) });
  await response.body?.cancel().catch(() => {});
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("当前账号无法访问课节媒体。");
}
export async function authorizeSubtitleLesson(userId: string, identity: SubtitleIdentity) {
  const key = `${userId}:${lessonKey(identity)}`;
  // getLiveApi checks the user's current saved credentials even on an access-cache hit.
  const api = await getLiveApi(userId);
  const cached = access.get(key);
  if (cached && cached.api === api && cached.until > Date.now()) return cached.lesson;
  const lesson = (await api.lessons(identity.courseId, true)).find(l => l.subId === identity.subId);
  if (!lesson) throw new Error("当前账号无法访问该课节。");
  if (lesson.status === "1") {
    const stream = (await api.streams(lesson.subId, lesson.courseId, lesson.type)).find(isClassroomStream);
    if (!stream) throw new Error("当前账号无法获取教室直播音源。");
    await verifySubtitleMediaAccess(stream.url);
  } else {
    const grant = await prisma.zjuLiveSubtitleGrant.findFirst({ where: { userId, subtitle: { lessonKey: lessonKey(identity), expiresAt: { gt: new Date() } } } });
    if (!grant) {
      if (!lesson.playbackUrl) throw new Error("该课节不在直播中，且当前账号没有字幕访问记录。");
      await verifySubtitleMediaAccess(lesson.playbackUrl);
    }
  }

  if (access.size >= 200) access.delete(access.keys().next().value!);
  access.set(key, { until: Date.now() + 30000, lesson, api });
  return lesson;
}
export function isClassroomStream(stream: { name: string; audioSource?: string }) {
  return stream.audioSource ? stream.audioSource === "classroom" : /^(教师画面|教室画面|教室|教师)$/.test(stream.name);
}
export async function joinLiveSubtitles(userId: string, identity: SubtitleIdentity, clientId: string) {
  if (!validSubtitleClient(clientId)) throw new Error("字幕客户端标识无效。");
  const lesson = await authorizeSubtitleLesson(userId, identity);
  if (lesson.status !== "1") throw new Error("直播已结束，请查看已保存的字幕。");
  const key = lessonKey(identity);
  return prisma.$transaction(async tx => {
    const subtitle = await tx.zjuLiveSubtitle.upsert({ where: { lessonKey: key }, update: {}, create: {
      lessonKey: key, ...identity, type: lesson.type, title: lesson.title,
      expiresAt: new Date(Date.now() + SUBTITLE_TTL_MS)
    } });
    if (subtitle.expiresAt <= new Date()) throw new Error("该课节字幕已过保存期限。");
    if (subtitle.status === "completed" || ["limited", "stopped"].includes(subtitle.status)) throw new Error("该课节识别已结束，请查看保存的字幕。");
    await tx.zjuLiveSubtitleGrant.upsert({ where: { subtitleId_userId: { subtitleId: subtitle.id, userId } }, create: { subtitleId: subtitle.id, userId }, update: {} });
    await tx.zjuLiveSubtitleViewer.upsert({ where: { subtitleId_userId_clientId: { subtitleId: subtitle.id, userId, clientId } }, update: { lastSeenAt: new Date() }, create: { subtitleId: subtitle.id, userId, clientId } });
    // A page refresh never resets audio, cues, revision, generation or an active lease.
    await tx.zjuLiveSubtitle.updateMany({ where: { id: subtitle.id, status: "idle" }, data: { status: "queued", finishedAt: null, error: null } });
    return { id: subtitle.id };
  });
}
export async function heartbeatLiveSubtitles(userId: string, identity: SubtitleIdentity, clientId: string) {
  await authorizeSubtitleLesson(userId, identity);
  const subtitle = await prisma.zjuLiveSubtitle.findUnique({ where: { lessonKey: lessonKey(identity) } });
  if (!subtitle || subtitle.expiresAt <= new Date()) return;
  await prisma.zjuLiveSubtitleViewer.updateMany({ where: { subtitleId: subtitle.id, userId, clientId }, data: { lastSeenAt: new Date() } });
}
export async function leaveLiveSubtitles(userId: string, identity: SubtitleIdentity, clientId: string) {
  await prisma.zjuLiveSubtitleViewer.deleteMany({ where: { userId, clientId, subtitle: { lessonKey: lessonKey(identity) } } });
}
export async function readLiveSubtitles(userId: string, identity: SubtitleIdentity, after = -1): Promise<SubtitleSnapshot | null> {
  await authorizeSubtitleLesson(userId, identity);
  const row = await prisma.zjuLiveSubtitle.findUnique({ where: { lessonKey: lessonKey(identity) } });
  if (!row || row.expiresAt <= new Date()) return null;
  // An invalid/new cursor receives the entire persisted history, with a single revision watermark.
  const reset = after < 0 || after > row.revision;
  const [cues, segments, viewers] = await Promise.all([
    prisma.zjuLiveSubtitleCue.findMany({ where: { subtitleId: row.id, revision: { gt: reset ? -1 : after, lte: row.revision } }, orderBy: { startMs: "asc" }, select: { id: true, startMs: true, endMs: true, text: true, revision: true } }),
    prisma.zjuLiveSubtitleSegment.findMany({ where: { subtitleId: row.id }, orderBy: { sequence: "desc" }, take: 30, select: { sequence: true, startMs: true, durationMs: true, observedAt: true } }),
    prisma.zjuLiveSubtitleViewer.count({ where: { subtitleId: row.id, lastSeenAt: { gt: new Date(Date.now() - VIEWER_TTL_MS) } } })
  ]);
  return { id: row.id, status: row.status, title: row.title, partial: row.partial, error: row.error, revision: row.revision,
    partialStartMs: row.partialStartMs, partialEndMs: row.partialEndMs, expiresAt: row.expiresAt.toISOString(), audioMs: row.audioMs, viewers, cues, segments: segments.reverse().map(s => ({ ...s, observedAt: s.observedAt.toISOString() })), reset };
}
