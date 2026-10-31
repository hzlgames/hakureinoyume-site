import { spawn } from "node:child_process";
// No source video or audio files are written; one <=60s PCM chunk is buffered.
export function runMedia(program: string, args: string[], signal: AbortSignal, maximum: number, timeoutMs = 90000): Promise<Buffer> {
  signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const child = spawn(program, args, { stdio: ["ignore","pipe","pipe"] });
    const chunks: Buffer[] = []; let size = 0, failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
    const abort = () => stop(new DOMException("转录已中止。", "AbortError"));
    const timer = setTimeout(() => stop(new Error("音频读取超时。")), timeoutMs);
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maximum) stop(new Error("音频分段超过内存限制。")); else chunks.push(chunk); });
    child.once("error", () => { failure ??= new Error("无法启动音频处理程序。"); });
    child.once("close", code => { clearTimeout(timer); signal.removeEventListener("abort", abort); if (failure || code !== 0) reject(failure ?? new Error("回放音轨读取失败。")); else resolve(Buffer.concat(chunks)); });
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  });
}
const protocols = ["-protocol_whitelist", "http,https,httpproxy,tcp,tls"];
export async function replayDuration(url: string, signal: AbortSignal) {
  const json = await runMedia(process.env.FFPROBE_PATH || "ffprobe", ["-v","error",...protocols,"-rw_timeout","15000000","-select_streams","a:0","-show_entries","format=duration:stream=duration","-of","json",url], signal, 256000, 45000);
  const data = JSON.parse(json.toString("utf8"));
  if (!data.streams?.length) throw new Error("回放没有可识别的教室音轨。");
  const ms = Math.round(Number(data.streams[0].duration || data.format?.duration) * 1000);
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > 24 * 60 * 60 * 1000) throw new Error("无法确认回放音频时长，未提交识别。");
  return ms;
}
export async function replayPcm(url: string, startMs: number, durationMs: number, signal: AbortSignal) {
  if (durationMs <= 0 || durationMs > 60000) throw new Error("音频分段时长无效。");
  const data = await runMedia(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner","-loglevel","error","-nostdin",...protocols,"-rw_timeout","15000000","-ss",String(startMs/1000),"-i",url,"-t",String(durationMs/1000),"-map","0:a:0","-vn","-af",`aresample=16000,atrim=end_sample=${Math.floor(durationMs*16)}`,"-ac","1","-ar","16000","-c:a","pcm_s16le","-f","s16le","pipe:1"], signal, 60 * 32000);
  if (data.length < 32 || data.length % 2) throw new Error("音频为空或解码不完整，未提交识别。");
  return data;
}
