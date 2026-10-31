// Doubao ASR 2.0 standard submit/query, adapted from doubao-asr-subtitles.
import { setTimeout as sleep } from "node:timers/promises";
export const RECORDING_RESOURCE = "volc.seedasr.auc";
export type RecordingCue = { startMs: number; endMs: number; text: string };
export type RecordingResult = { text: string; cues: RecordingCue[] };
export function recordingHeaders(apiKey: string, requestId: string, resourceId: string) {
  return { "Content-Type": "application/json", "X-Api-Key": apiKey, "X-Api-Resource-Id": resourceId, "X-Api-Request-Id": requestId, "X-Api-Sequence": "-1" };
}
export function recordingResult(payload: unknown, durationMs: number): RecordingResult {
  const body = payload as { result?: { text?: string; utterances?: { text?: string; start_time?: number; end_time?: number }[] } };
  if (!body?.result || typeof body.result !== "object") throw new Error("火山引擎返回的结果不完整，请稍后查询原任务。 ");
  const text = typeof body?.result?.text === "string" ? body.result.text.trim() : "";
  const cues = (Array.isArray(body?.result?.utterances) ? body.result.utterances : []).flatMap(u => {
    if (!u.text?.trim() || !Number.isFinite(u.start_time) || !Number.isFinite(u.end_time)) return [];
    const startMs = Math.max(0, Math.round(u.start_time!)), endMs = Math.min(durationMs, Math.round(u.end_time!));
    return endMs > startMs ? [{ startMs, endMs, text: u.text.trim() }] : [];
  });
  if (!cues.length && text) cues.push({ startMs: 0, endMs: durationMs, text });
  return { text: text || cues.map(c => c.text).join(""), cues };
}
async function call(action: "submit" | "query", headers: Record<string, string>, body: unknown, signal: AbortSignal, fetcher: typeof fetch) {
  signal.throwIfAborted();
  const response = await fetcher(`https://openspeech.bytedance.com/api/v3/auc/bigmodel/${action}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  const code = response.headers.get("X-Api-Status-Code");
  // Never expose response messages, signed URLs or authorization headers in job logs.
  if (!response.ok || !code) { await response.body?.cancel(); throw new Error("火山引擎请求未获确认，请稍后恢复任务查询原提交记录。"); }
  if (!["20000000", "20000001", "20000002", "20000003"].includes(code)) { await response.body?.cancel(); throw new Error(`火山引擎识别失败（状态 ${/^\d{8}$/.test(code) ? code : "未知"}）。`); }
  if (action === "submit" || code !== "20000000") { await response.body?.cancel(); return { code, payload: {} }; }
  // A one-minute clip has a small response. Bound it before JSON decoding.
  const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 2 * 1024 * 1024) throw new Error("识别结果超过大小限制。"); chunks.push(part.value); } } finally { await reader.cancel().catch(() => {}); }
  return { code, payload: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") };
}
export function pcmWav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write("RIFF",0); header.writeUInt32LE(pcm.length+36,4); header.write("WAVEfmt ",8);
  header.writeUInt32LE(16,16); header.writeUInt16LE(1,20); header.writeUInt16LE(1,22);
  header.writeUInt32LE(16000,24); header.writeUInt32LE(32000,28); header.writeUInt16LE(2,32); header.writeUInt16LE(16,34);
  header.write("data",36); header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
export async function submitRecording(options: { apiKey: string; requestId: string; resourceId: string; pcm: Buffer; signal: AbortSignal; context?: string }, fetcher = fetch) {
  if (options.pcm.length > 60 * 32000 || !options.pcm.length) throw new Error("只允许提交不超过一分钟的音频分段。");
  const headers = recordingHeaders(options.apiKey, options.requestId, options.resourceId);
  const result = await call("submit", headers, { user: { uid: "zju-shared-replay" }, audio: { data: pcmWav(options.pcm).toString("base64"), format: "wav", codec: "raw", rate: 16000, bits: 16, channel: 1 }, request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, show_utterances: true, ...(options.context ? { corpus: { context: JSON.stringify({ context_type: "dialog_ctx", context_data: [{ text: options.context.slice(-320) }] }) } } : {}) } }, options.signal, fetcher);
  if (result.code !== "20000000") throw new Error("火山引擎未确认提交，将保留任务 ID 以便查询，避免重复计费。");
}
export async function pollRecording(options: { apiKey: string; requestId: string; resourceId: string; durationMs: number; signal: AbortSignal; intervalMs?: number }, fetcher = fetch): Promise<RecordingResult> {
  const headers = recordingHeaders(options.apiKey, options.requestId, options.resourceId);
  for (let i = 0; i < 200; i++) {
    const { code, payload } = await call("query", headers, {}, options.signal, fetcher);
    if (code === "20000003") return { text: "", cues: [] };
    if (code === "20000000") return recordingResult(payload, options.durationMs);
    await sleep(options.intervalMs ?? 3000, undefined, { signal: options.signal });
  }
  throw new Error("当前分段仍在云端处理，稍后恢复会查询原任务，不会重新提交。");
}
export function recordingExports(cues: RecordingCue[]) {
  const stamp = (ms: number) => { const t = Math.max(0, Math.round(ms)); return `${String(Math.floor(t / 3600000)).padStart(2,"0")}:${String(Math.floor(t / 60000) % 60).padStart(2,"0")}:${String(Math.floor(t / 1000) % 60).padStart(2,"0")},${String(t % 1000).padStart(3,"0")}`; };
  const sorted = [...cues].sort((a,b) => a.startMs - b.startMs);
  return { srt: "\ufeff" + sorted.map((c,i) => `${i+1}\n${stamp(c.startMs)} --> ${stamp(c.endMs)}\n${c.text.replace(/\r?\n/g," ")}\n`).join("\n"), txt: "\ufeff" + sorted.map(c => c.text).join("\n") };
}
