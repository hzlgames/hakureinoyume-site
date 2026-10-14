import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';

export const DEFAULTS = Object.freeze({
  endpoint: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
  resourceId: 'volc.seedasr.sauc.duration', chunkMs: 200, sessionSeconds: 300,
  duration: 0, realtime: true, connectTimeoutMs: 15000, audioTimeoutMs: 20000,
  finalTimeoutMs: 15000, retries: 3, retryDelayMs: 2000,
  ffmpegPath: 'ffmpeg', audioMap: '0:a:0', liveStartIndex: -1,
});

export async function loadAsrOptions(overrides = {}, env = process.env) {
  const configPath = overrides.config || env.DOUBAO_ASR_CONFIG;
  const file = configPath ? JSON.parse((await readFile(configPath, 'utf8')).replace(/^\ufeff/, '')) : {};
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('配置文件必须是 JSON 对象');
  for (const request of [file.request, overrides.request]) {
    if (request !== undefined && (request === null || typeof request !== 'object' || Array.isArray(request))) throw new Error('request 必须是 JSON 对象');
  }
  const envOptions = Object.fromEntries(Object.entries({
    apiKey: env.DOUBAO_ASR_API_KEY || env.API_KEY, keyEnv: env.DOUBAO_ASR_KEY_ENV,
    resourceId: env.DOUBAO_ASR_STREAM_RESOURCE_ID, endpoint: env.DOUBAO_ASR_WS_URL,
    ffmpegPath: env.FFMPEG_PATH, out: env.DOUBAO_ASR_OUTPUT_DIR,
  }).filter(([, v]) => v));
  const options = { ...DEFAULTS, ...envOptions, ...file, ...overrides };
  options.request = { ...file.request, ...overrides.request };
  // Secrets are deliberately excluded from JSON config and CLI arguments.
  if (file.apiKey) throw new Error('请用环境变量或 keyEnv 配置密钥，不要把 apiKey 放进 JSON 配置');
  if (options.keyEnv && !overrides.apiKey) {
    const secrets = parse(await readFile(options.keyEnv));
    options.apiKey = secrets.DOUBAO_ASR_API_KEY || secrets.API_KEY || options.apiKey;
  }
  if (!options.apiKey) throw new Error('缺少 DOUBAO_ASR_API_KEY / API_KEY；也可通过 --key-env 指定既有 .env');
  for (const [key, min, max] of [
    ['chunkMs', 20, 1000], ['sessionSeconds', 1, 3600], ['duration', 0, Infinity],
    ['connectTimeoutMs', 100, 120000], ['audioTimeoutMs', 100, 120000], ['finalTimeoutMs', 100, 120000],
    ['retries', 0, 20], ['retryDelayMs', 0, 60000],
  ]) {
    options[key] = Number(options[key]);
    if (!Number.isFinite(options[key]) || options[key] < min || options[key] > max) throw new Error(`${key} 超出范围 ${min}–${max}`);
  }
  if (!Number.isInteger(options.retries)) throw new Error('retries 必须是整数');
  if (options.chunkMs > options.sessionSeconds * 1000) throw new Error('chunkMs 必须小于会话时长');
  if (typeof options.realtime !== 'boolean') throw new Error('realtime 必须是布尔值');
  if (options.save !== undefined && typeof options.save !== 'boolean') throw new Error('save 必须是布尔值');
  if (options.display && !['partial', 'final', 'jsonl'].includes(options.display)) throw new Error('display 必须是 partial、final 或 jsonl');
  if (!/^wss?:\/\//.test(options.endpoint)) throw new Error('endpoint 必须是 WebSocket URL');
  for (const key of ['inputArgs', 'outputArgs']) {
    if (options[key] && (!Array.isArray(options[key]) || options[key].some(v => typeof v !== 'string'))) throw new Error(`${key} 必须是字符串数组`);
  }
  if (options.request && (typeof options.request !== 'object' || Array.isArray(options.request))) throw new Error('request 必须是 JSON 对象');
  return options;
}
