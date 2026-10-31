// Pure contracts shared by the worker, API and player. Times use the source media timeline.
export const SUBTITLE_TTL_MS = 7 * 86400000;
export const VIEWER_TTL_MS = 45000;
export const IDLE_GRACE_MS = 180000;
export type SubtitleIdentity = { courseId: string; subId: string };
export type SubtitleCue = { id: string; startMs: number; endMs: number; text: string; revision: number };
export type SubtitleSegment = { sequence: number; startMs: number; durationMs: number; observedAt: string };
export type SubtitleSnapshot = {
  id: string; status: string; title: string; partial: string; error: string | null;
  partialStartMs: number | null; partialEndMs: number | null;
  revision: number; expiresAt: string; audioMs: number; viewers: number;
  cues: SubtitleCue[]; segments: SubtitleSegment[]; reset: boolean;
};
export function lessonKey({ courseId, subId }: SubtitleIdentity) {
  if (!/^\d{1,30}$/.test(courseId) || !/^\d{1,30}$/.test(subId)) throw new Error("请提供有效的课程和课节 ID。");
  return `classroom:112:${courseId}:${subId}:classroom`;
}
export type MediaSegment = { sequence: number; url: string; durationMs: number; programDateTime: number | null };
export function parseMediaPlaylist(body: string, base: string): { segments: MediaSegment[]; ended: boolean; targetMs: number } {
  if (!body.startsWith("#EXTM3U") || body.includes("#EXT-X-STREAM-INF") || body.includes("#EXT-X-KEY")) throw new Error("教室音源需要未加密的 HLS 媒体播放列表。");
  let sequence = 0, durationMs = 0, targetMs = 2000, date: number | null = null;
  const segments: MediaSegment[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) sequence = Number(line.split(":")[1]);
    else if (line.startsWith("#EXT-X-TARGETDURATION:")) targetMs = Number(line.split(":")[1]) * 1000;
    else if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) { const time = Date.parse(line.slice(25)); date = Number.isFinite(time) ? time : null; }
    else if (line.startsWith("#EXTINF:")) durationMs = Number(line.slice(8).split(",")[0]) * 1000;
    else if (line && !line.startsWith("#")) {
      const url = new URL(line, base);
      // Segments must stay on the authenticated upstream media host, never arbitrary client URLs.
      if (url.origin !== new URL(base).origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("音频分片来源异常。");
      if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30000) throw new Error("HLS 分片时间无效。");
      segments.push({ sequence: sequence++, url: url.href, durationMs, programDateTime: date });
      if (date !== null) date += durationMs;
    }
  }
  if (!segments.length || segments.length > 1000) throw new Error("未发现可处理的直播分片。");
  return { segments, ended: body.includes("#EXT-X-ENDLIST"), targetMs: Math.min(10000, Math.max(500, targetMs)) };
}
export type AudioAnchor = { audioStartMs: number; audioEndMs: number; mediaStartMs: number; mediaDurationMs: number };
export function audioToMedia(ms: number, anchors: AudioAnchor[]) {
  const a = anchors.find(a => ms >= a.audioStartMs && ms <= a.audioEndMs) || (ms < (anchors[0]?.audioStartMs ?? 0) ? anchors[0] : anchors.at(-1));
  if (!a) throw new Error("字幕缺少媒体时间锚点。");
  return Math.round(a.mediaStartMs + Math.max(0, Math.min(ms - a.audioStartMs, a.audioEndMs - a.audioStartMs)) * a.mediaDurationMs / (a.audioEndMs - a.audioStartMs));
}
export function activeCue(cues: SubtitleCue[], ms: number) {
  return cues.find(c => c.startMs <= ms && c.endMs >= ms)?.text ?? "";
}
export function mergeSubtitleCues(previous: SubtitleCue[], incoming: SubtitleCue[], reset = false) {
  const map = new Map((reset ? [] : previous).map(c => [c.id, c]));
  for (const cue of incoming) map.set(cue.id, cue);
  return [...map.values()].sort((a, b) => a.startMs - b.startMs);
}
