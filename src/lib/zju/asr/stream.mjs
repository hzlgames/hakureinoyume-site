import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import { DEFAULTS } from './config.mjs';
import { PCM_FORMAT, BYTES_PER_SECOND, encodeRequest, decodeResponse, extractResult } from './protocol.mjs';

const abortError = () => Object.assign(new Error('识别已停止'), { name: 'AbortError' });
export function redactError(error, secrets = []) {
  let message = error?.message || String(error);
  for (const value of secrets.filter(Boolean)) message = message.split(value).join('[REDACTED]');
  return message.replace(/(?:https?|rtmps?):\/\/[^\s"']+/g, '[MEDIA_URL]');
}

function timed(promise, ms, signal, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, new Error(`${label}超时（${ms} ms）`)), ms);
    const abort = () => finish(reject, abortError());
    function finish(fn, value) { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    Promise.resolve(promise).then(v => finish(resolve, v), e => finish(reject, e));
  });
}

class Queue {
  values = []; waiters = []; error = null; done = false;
  push(value) {
    if (this.done) return;
    if (this.waiters.length) this.waiters.shift().resolve({ value, done: false });
    else if (this.values.length < 1000) this.values.push(value);
    else this.fail(new Error('结果消费者过慢，事件队列超过 1000 条'));
  }
  end() { this.done = true; for (const w of this.waiters.splice(0)) w.resolve({ done: true }); }
  fail(error) { if (this.done) return; this.error = error; this.done = true; for (const w of this.waiters.splice(0)) w.reject(error); }
  next() {
    if (this.values.length) return Promise.resolve({ value: this.values.shift(), done: false });
    if (this.error) return Promise.reject(this.error);
    if (this.done) return Promise.resolve({ done: true });
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
  [Symbol.asyncIterator]() { return this; }
}

/** Accept any AsyncIterable<Buffer> containing pcm_s16le / 16 kHz / mono. */
export async function* pcmFrames(source, { chunkMs = 200, duration = 0 } = {}) {
  const size = Math.round(BYTES_PER_SECOND * chunkMs / 1000 / 2) * 2;
  if (size < 2) throw new Error('chunkMs 太小');
  let pending = Buffer.alloc(0), bytes = 0;
  const max = duration ? Math.floor(duration * BYTES_PER_SECOND / 2) * 2 : Infinity;
  for await (const value of source) {
    pending = Buffer.concat([pending, Buffer.from(value)]);
    while (pending.length >= size || bytes + pending.length >= max) {
      const length = Math.min(size, pending.length, max - bytes);
      if (!length) return;
      yield pending.subarray(0, length);
      pending = pending.subarray(length); bytes += length;
      if (bytes >= max) return;
    }
  }
  if (pending.length % 2) throw new Error('PCM 数据不是完整的 16-bit 采样点');
  if (pending.length) yield pending;
}

export function createFfmpegAudio(url, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const headers = o.inputHeaders ? Object.entries(o.inputHeaders).map(([k, v]) => {
    if (/[\r\n]/.test(k + v)) throw new Error('inputHeaders 不允许换行');
    return `${k}: ${v}\r\n`;
  }).join('') : '';
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-rw_timeout', String(o.audioTimeoutMs * 1000),
    ...(headers ? ['-headers', headers] : []), ...(o.inputArgs || []),
    ...(/\.m3u8(?:\?|$)/i.test(url) ? ['-live_start_index', String(o.liveStartIndex)] : []), '-i', url,
    ...(o.outputArgs || []), '-map', o.audioMap, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1'];
  const child = spawn(o.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '', spawnError;
  child.stderr.on('data', d => { stderr = (stderr + d.toString('utf8')).slice(-12000); });
  const closed = new Promise(resolve => {
    child.once('error', e => { spawnError = e; resolve({ code: null }); });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const audio = (async function* () {
    for await (const chunk of child.stdout) yield chunk;
    const { code } = await closed;
    if (spawnError) throw new Error(`无法启动 FFmpeg：${redactError(spawnError, [url, o.apiKey])}`);
    if (code !== 0) throw new Error(`FFmpeg 退出 ${code}：${redactError(new Error(stderr), [url, o.apiKey])}`);
  })();
  return { audio, async stop() {
    // A paused stdout pipe can retain unread bytes after FFmpeg exits and delay 'close'.
    child.stdout.destroy();
    if (child.exitCode === null && !child.killed) child.kill();
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000);
    await closed; clearTimeout(timer);
  } };
}

/** One WebSocket session; yields session-start, response and session-end. */
export async function* recognizePcm(audio, options = {}) {
  const o = { ...DEFAULTS, ...options };
  if (!o.apiKey) throw new Error('缺少 ASR API Key');
  const controller = new AbortController();
  const signal = controller.signal;
  const relayAbort = () => controller.abort();
  o.signal?.addEventListener('abort', relayAbort, { once: true });
  if (o.signal?.aborted) controller.abort();
  const iterator = audio[Symbol.asyncIterator]();
  let ws, sender, bytes = 0, final = false;
  const queue = new Queue(), started = performance.now(), connectId = randomUUID();
  let connected = false;
  const fail = e => { queue.fail(e); if (connected) controller.abort(); };
  try {
    // Pull the first PCM before opening the service to avoid an idle-audio timeout.
    const first = await timed(iterator.next(), o.audioTimeoutMs, signal, '获取音频');
    if (first.done) throw new Error('音频源为空或没有音轨');
    let logId;
    const opened = new Promise((resolve, reject) => {
      ws = new WebSocket(o.endpoint, { headers: {
        'X-Api-Key': o.apiKey, 'X-Api-Resource-Id': o.resourceId,
        'X-Api-Request-Id': connectId, 'X-Api-Connect-Id': connectId, 'X-Api-Sequence': '-1',
      }, handshakeTimeout: o.connectTimeoutMs, maxPayload: 8 * 1024 * 1024 });
      ws.on('upgrade', response => { logId = response.headers['x-tt-logid']; });
      ws.on('unexpected-response', (_req, response) => {
        response.resume();
        const e = Object.assign(new Error(`ASR 握手失败：HTTP ${response.statusCode}，${response.headers['x-api-message'] || ''}，logid=${response.headers['x-tt-logid'] || ''}`), { fatal: [400, 401, 403].includes(response.statusCode) });
        reject(e); fail(e);
      });
      ws.on('error', e => { reject(e); fail(e); });
      ws.on('open', () => { connected = true; resolve(); });
      ws.on('close', () => { if (!final && !signal.aborted) fail(new Error('ASR 在最终响应前断开')); });
      ws.on('message', (data, binary) => {
        try {
          if (!binary) throw new Error('ASR 返回了非二进制帧');
          const parsed = decodeResponse(data);
          if (parsed.errorCode) throw Object.assign(new Error(`ASR ${parsed.errorCode}：${JSON.stringify(parsed.body)}`), { fatal: [45000001, 45000002, 45000030, 45000151].includes(parsed.errorCode) });
          queue.push({ ...parsed, type: 'response', messageType: parsed.type, connectId,
            elapsedMs: Math.round(performance.now() - started), audioSentMs: bytes / 32,
            resultType: o.request?.result_type || 'full', result: extractResult(parsed.body) });
          if (parsed.final) { final = true; queue.end(); }
        } catch (e) { fail(e); }
      });
    });
    await timed(opened, o.connectTimeoutMs, signal, 'ASR 建连');
    yield { type: 'session-start', connectId, logId, resourceId: o.resourceId };
    const send = data => new Promise((resolve, reject) => ws.send(data, e => e ? reject(e) : resolve()));
    await send(encodeRequest({ user: { uid: o.uid || 'zju-live-better' }, audio: PCM_FORMAT,
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, show_utterances: true,
        enable_nonstream: true, result_type: 'full', ...o.request } }));
    sender = (async () => {
      let next = first, nextAt = o.paceClock?.nextAt ?? performance.now();
      while (!next.done) {
        if (signal.aborted) throw abortError();
        if (o.realtime) await sleep(Math.max(0, nextAt - performance.now()), undefined, { signal });
        const chunk = Buffer.from(next.value);
        await send(encodeRequest(chunk, { audio: true }));
        bytes += chunk.length;
        // Advance a monotonic audio clock. Decode/network waits must not add permanent drift.
        nextAt += chunk.length / BYTES_PER_SECOND * 1000;
        if (o.paceClock) o.paceClock.nextAt = nextAt;
        next = await timed(iterator.next(), o.audioTimeoutMs, signal, '读取音频');
      }
      await send(encodeRequest(Buffer.alloc(0), { audio: true, last: true }));
    })();
    sender.catch(fail);
    const abort = () => { queue.fail(abortError()); ws?.terminate(); };
    signal.addEventListener('abort', abort, { once: true });
    // Start final-response timeout only after the audio sender has completed.
    let finishTimer;
    sender.then(() => { if (!final) finishTimer = setTimeout(() => fail(new Error('等待 ASR 最终结果超时')), o.finalTimeoutMs); }, () => {});
    try {
      for await (const event of queue) yield event;
      await sender;
      yield { type: 'session-end', connectId, audioSentMs: bytes / 32, final, elapsedMs: Math.round(performance.now() - started) };
    } finally { clearTimeout(finishTimer); signal.removeEventListener('abort', abort); }
  } catch (e) {
    const safe = Object.assign(new Error(redactError(e, [o.apiKey])), { name: e.name, fatal: e.fatal, audioSentMs: bytes / 32 });
    throw safe;
  } finally {
    controller.abort();
    ws?.terminate();
    o.signal?.removeEventListener('abort', relayAbort);
    // Source cleanup is owned by the caller; don't wait on a hung custom source.
    sender?.catch(() => {});
  }
}

/** Keep one PCM pipe across planned sessions; restart source only after a failure. */
export async function* transcribeLive(options) {
  const o = { ...DEFAULTS, ...options };
  let offsetMs = 0, session = 0, attempts = 0;
  const paceClock = {};
  while (!o.signal?.aborted) {
    let source;
    try {
      const url = o.resolveUrl ? await o.resolveUrl() : o.url;
      if (!url && !o.audio) throw new Error('需要 url、resolveUrl 或 audio');
      source = o.audio ? { audio: o.audio, stop: async () => {} } : createFfmpegAudio(url, o);
      const remaining = o.duration ? Math.max(0, o.duration - offsetMs / 1000) : 0;
      if (o.duration && remaining <= 0) return;
      const iterator = pcmFrames(source.audio, { chunkMs: o.chunkMs, duration: remaining })[Symbol.asyncIterator]();
      let exhausted = false;
      while (!exhausted && !o.signal?.aborted) {
        const first = await timed(iterator.next(), o.audioTimeoutMs, o.signal, '获取音频');
        if (first.done) return;
        const current = ++session;
        let sessionSentMs = 0;
        const view = (async function* () {
          const count = Math.max(1, Math.floor(o.sessionSeconds * 1000 / o.chunkMs));
          yield first.value;
          for (let i = 1; i < count; i++) {
            const next = await iterator.next();
            if (next.done) { exhausted = true; return; }
            yield next.value;
          }
        })();
        try {
          for await (const event of recognizePcm(view, { ...o, paceClock })) {
            if (event.audioSentMs !== undefined) sessionSentMs = event.audioSentMs;
            yield { ...event, session: current, offsetMs, timeline: 'submitted-audio' };
          }
        } catch (e) {
          // Consumed audio may not have a final recognition result; record the discontinuity.
          offsetMs += e.audioSentMs ?? sessionSentMs;
          throw e;
        }
        offsetMs += sessionSentMs;
        attempts = 0;
        if (o.duration && offsetMs >= o.duration * 1000 - 1) return;
      }
      return;
    } catch (e) {
      if (e.name === 'AbortError' || o.signal?.aborted) return;
      if (e.fatal || o.audio || attempts >= o.retries) throw e;
      attempts++;
      delete paceClock.nextAt;
      yield { type: 'reconnect', attempt: attempts, offsetMs, error: redactError(e, [o.apiKey]), discontinuity: true };
      await source?.stop(); source = null;
      await sleep(o.retryDelayMs * attempts, undefined, { signal: o.signal });
    } finally { await source?.stop(); }
  }
}
