import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseMediaPlaylist, type AudioAnchor, type MediaSegment } from "./subtitle-core";

async function boundedBody(response: Response, limit: number) {
  if (!response.ok || !response.body) throw new Error(`教室流请求失败（HTTP ${response.status}）。`);
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > limit) throw new Error("直播分片超过大小限制。"); chunks.push(next.value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
export async function decodeClassroomSegment(input: Buffer, signal: AbortSignal, durationMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-protocol_whitelist", "pipe", "-f", "mpegts", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
    let settled = false, bytes = 0; const chunks: Buffer[] = [];
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort); if (error) { child.kill("SIGKILL"); reject(error); } else resolve(Buffer.concat(chunks)); };
    const abort = () => finish(new DOMException("识别已停止", "AbortError"));
    const timer = setTimeout(() => finish(new Error("音频解码超时。")), 15000);
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", () => finish(new Error("无法启动 FFmpeg。")));
    child.stdin.on("error", () => {}); child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > (durationMs / 1000 + 3) * 32000) finish(new Error("分片音频长度异常。")); else chunks.push(chunk); });
    child.once("close", code => finish(code !== 0 || bytes < 2 || bytes % 2 ? new Error("教室流没有可解码音轨。") : undefined));
    if (signal.aborted) abort(); else child.stdin.end(input);
  });
}
export function createClassroomAudio(options: {
  resolveUrl: () => Promise<string>; signal: AbortSignal; lastSequence: number | null;
  timelineMs: number; audioBaseMs: number; maxAudioMs: number;
  onSegment: (segment: MediaSegment, startMs: number, audioEndMs: number, observedAt: Date, gap: boolean) => Promise<void>;
}) {
  const anchors: AudioAnchor[] = [];
  const audio = (async function* () {
    let url = await options.resolveUrl(), last = options.lastSequence, mediaMs = options.timelineMs, audioMs = options.audioBaseMs;
    let progressed = Date.now(), failures = 0, refreshedAt = Date.now();
    while (!options.signal.aborted && audioMs - options.audioBaseMs < options.maxAudioMs) {
      try {
        if (Date.now() - refreshedAt > 60000) { url = await options.resolveUrl(); refreshedAt = Date.now(); }
        const signal = AbortSignal.any([options.signal, AbortSignal.timeout(15000)]);
        const body = (await boundedBody(await fetch(url, { signal }), 256000)).toString("utf8");
        const playlist = parseMediaPlaylist(body, url);
        if (last !== null && playlist.segments.at(-1)!.sequence < last) throw new Error("直播源分片序号重置，请重新建立媒体时间线。");
        // Start near the live edge on the first request; resume buffered segments when possible.
        const available = last === null ? playlist.segments.slice(-2) : playlist.segments.filter(s => s.sequence > last!);
        for (const segment of available) {
          options.signal.throwIfAborted();
          const skipped = last === null ? 0 : Math.max(0, segment.sequence - last - 1);
          if (skipped) mediaMs += skipped * playlist.targetMs;
          const observedAt = new Date();
          const bytes = await boundedBody(await fetch(segment.url, { signal: AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) }), 16 * 1024 * 1024);
          const pcm = await decodeClassroomSegment(bytes, options.signal, segment.durationMs);
          anchors.push({ audioStartMs: audioMs, audioEndMs: audioMs + pcm.length / 32, mediaStartMs: mediaMs, mediaDurationMs: segment.durationMs });
          // This bounded window is enough for the rolling ASR session and final response.
          if (anchors.length > 2000) anchors.splice(0, anchors.length - 2000);
          await options.onSegment(segment, mediaMs, audioMs + pcm.length / 32, observedAt, skipped > 0);
          yield pcm;
          audioMs += pcm.length / 32; mediaMs += segment.durationMs; last = segment.sequence; progressed = Date.now(); failures = 0;
          if (audioMs - options.audioBaseMs >= options.maxAudioMs) return;
        }
        if (playlist.ended) return;
        if (Date.now() - progressed > 60000) throw new Error("直播音频超过一分钟没有更新。");
        if (!available.length) await sleep(Math.min(500, playlist.targetMs / 4), undefined, { signal: options.signal });
      } catch (error) {
        if (options.signal.aborted || error instanceof Error && error.name === "AbortError") throw error;
        if (++failures > 3) throw error;
        await sleep(1000 * failures, undefined, { signal: options.signal });
        url = await options.resolveUrl(); refreshedAt = Date.now();
      }
    }
  })();
  return { audio, anchors };
}
