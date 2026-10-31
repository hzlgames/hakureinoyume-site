import { gzipSync, gunzipSync } from 'node:zlib';

export const PCM_FORMAT = Object.freeze({ format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 });
export const BYTES_PER_SECOND = 32000;

export function encodeRequest(payload, { audio = false, last = false } = {}) {
  const body = gzipSync(audio ? Buffer.from(payload) : Buffer.from(JSON.stringify(payload)));
  const header = Buffer.from([0x11, (audio ? 0x20 : 0x10) | (last ? 2 : 0), audio ? 0x01 : 0x11, 0]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  return Buffer.concat([header, size, body]);
}

export function decodeResponse(input) {
  const data = Buffer.from(input);
  if (data.length < 8 || data[0] >> 4 !== 1) throw new Error('ASR 协议头无效');
  let offset = (data[0] & 15) * 4;
  const type = data[1] >> 4, flags = data[1] & 15, compression = data[2] & 15;
  if (offset < 4 || offset + 4 > data.length) throw new Error('ASR 响应被截断');
  let sequence, errorCode;
  if (type === 15 || flags & 1) {
    if (offset + 8 > data.length) throw new Error('ASR 响应被截断');
    if (type === 15) errorCode = data.readUInt32BE(offset);
    else sequence = data.readInt32BE(offset);
    offset += 4;
  }
  const size = data.readUInt32BE(offset);
  if (size !== data.length - offset - 4) throw new Error('ASR 响应长度不一致');
  let payload = data.subarray(offset + 4);
  if (compression === 1) payload = gunzipSync(payload, { maxOutputLength: 8 * 1024 * 1024 });
  else if (compression !== 0) throw new Error(`未知 ASR 压缩格式 ${compression}`);
  const serialization = data[2] >> 4;
  const text = payload.toString('utf8');
  let body = text;
  if (serialization === 1 && text) {
    try { body = JSON.parse(text); }
    catch { if (type !== 15) throw new Error('ASR JSON 无效'); }
  }
  return { type, flags, sequence, errorCode, body, final: !!(flags & 2) };
}

export function extractResult(body) {
  const result = body?.result;
  return (Array.isArray(result) ? result[0] : result) || {};
}
