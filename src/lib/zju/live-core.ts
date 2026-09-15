// Adapted from the user-provided livePlayer.js. Keep signed stream URLs uncached.
import { asRecord, readNumber, readString } from "./shared";

export type LiveCourse = { id: string; title: string; teacher: string };
export type LiveLesson = { subId: string; courseId: string; title: string; status: string; type: string; startAt: number; room: string; playbackUrl: string | null };
export type LiveStream = { name: string; url: string };
export type LiveScan = { live: LiveLesson[]; failed: LiveCourse[]; checked: number };
type Client = { fetch(url: string, init?: RequestInit): Promise<Response> };
const BASE = "https://yjapi.cmc.zju.edu.cn/courseapi/";
const COURSES = "https://education.cmc.zju.edu.cn/personal/courseapi/vlabpassportapi/v1/account-profile/course?nowpage=1&per-page=100&force_mycourse=1";
const TODAY = "https://classroom.zju.edu.cn/courseapi/v2/course-live/search-live-course-list?need_time_quantum=1&unique_course=1&with_sub_duration=1&with_sub_data=1&tenant=112";
const STREAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPad; CPU OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/91.0.4472.77 Mobile/15E148 Safari/604.1",
  Referer: "https://interactivemeta.cmc.zju.edu.cn/"
};
const idString = (value: unknown) => typeof value === "number" ? String(value) : readString(value);
export const validLiveId = (value: string) => /^\d{1,30}$/.test(value);
export function safePlaybackUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function getReplayUrl(content: unknown): string | null {
  try {
    const parsed = asRecord(typeof content === "string" ? JSON.parse(content) : content);
    const url = asRecord(parsed.playback).url;
    return safePlaybackUrl(Array.isArray(url) ? url[0] : url);
  } catch { return null; }
}
function lesson(row: Record<string, unknown>, courseId = ""): LiveLesson {
  return { subId: idString(row.sub_id), courseId: courseId || idString(row.course_id), title: readString(row.title) || "未命名课节", status: idString(row.status), type: readString(row.sub_type) || readString(row.type), startAt: readNumber(row.start_at) ?? 0, room: readString(row.room_name), playbackUrl: getReplayUrl(row.content) };
}
export function createLiveApi(client: Client, now = Date.now) {
  const cache = new Map<string, { expires: number; data: unknown }>();
  async function request(url: string, options: { ttl?: number; refresh?: boolean; headers?: HeadersInit; info?: boolean; signal?: AbortSignal } = {}) {
    options.signal?.throwIfAborted();
    const hit = cache.get(url);
    if (!options.refresh && hit && hit.expires > now()) return hit.data;
    const timeout = AbortSignal.timeout(15000);
    const response = await client.fetch(url, { headers: options.headers, signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout });
    if (!response.ok) throw new Error(`智云接口请求失败：HTTP ${response.status}`);
    const json = asRecord(await response.json());
    const result = asRecord(asRecord(json.params).result ?? json.result);
    const data = options.info ? json.data : json.list ?? result.data;
    if (json.success === false || result.success === false || (json.code != null && ![0, 200].includes(Number(json.code))) ||
      (options.info ? !data || typeof data !== "object" || Array.isArray(data) : !Array.isArray(data))) {
      throw new Error("智云接口返回失败或数据格式异常，请检查登录状态。");
    }
    if (options.ttl) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(url, { data, expires: now() + options.ttl });
    }
    return data;
  }
  async function list(url: string, options: Parameters<typeof request>[1] = {}) {
    return (await request(url, options) as unknown[]).map(asRecord);
  }
  return {
    async courses(refresh = false, signal?: AbortSignal): Promise<LiveCourse[]> {
      const rows = await list(COURSES, { ttl: 300000, refresh, signal });
      return [...new Map(rows.map(c => [idString(c.Id), { id: idString(c.Id), title: readString(c.Title) || "未命名课程", teacher: readString(c.Teacher) }])).values()].filter(c => validLiveId(c.id));
    },
    async lessons(courseId: string, refresh = false, signal?: AbortSignal): Promise<LiveLesson[]> {
      const rows = await list(`${BASE}v2/course/catalogue?course_id=${encodeURIComponent(courseId)}`, { ttl: 60000, refresh, signal });
      return rows.map(row => lesson(row, courseId)).filter(l => validLiveId(l.subId)).sort((a, b) => b.startAt - a.startAt);
    },
    async today(refresh = false): Promise<LiveLesson[]> {
      const groups = await list(TODAY, { ttl: 60000, refresh });
      return groups.flatMap(g => Array.isArray(g.list) ? g.list.map(asRecord) : [g]).map(l => lesson({ ...l, status: l.sub_status ?? l.status })).filter(l => validLiveId(l.subId) && l.status === "1");
    },
    async streams(subId: string, courseId = "", type = ""): Promise<LiveStream[]> {
      const portal = async () => {
        const data = asRecord(await request(`https://classroom.zju.edu.cn/courseapi/v3/portal-home-setting/get-sub-info?course_id=${encodeURIComponent(courseId)}&sub_id=${encodeURIComponent(subId)}`, { info: true, headers: { Referer: "https://classroom.zju.edu.cn/" } }));
        const names: Record<string, string> = { output: "教师画面", output_tts: "课件画面", output_student: "学生画面" };
        return Object.entries(asRecord(data.live_url)).flatMap(([key, value]) => {
          const url = safePlaybackUrl(asRecord(value).m3u8);
          return url ? [{ name: names[key] || key, url }] : [];
        });
      };
      if (type === "course_live" && courseId) return portal();
      const rows = await list(`${BASE}index.php/v2/meta/getscreenstream?sub_id=${encodeURIComponent(subId)}&clear_cache=1`, { headers: STREAM_HEADERS });
      const streams = rows.flatMap(s => {
        const url = safePlaybackUrl(s.stream_m3u8);
        return url ? [{ name: readString(s.stream_name) || `画面 ${idString(s.type)}`, url }] : [];
      });
      return streams.length || type === "ilive" || !courseId ? streams : portal();
    }
  };
}
export async function scanLive(api: ReturnType<typeof createLiveApi>, options: { signal?: AbortSignal; refresh?: boolean; progress?: (checked: number, total: number) => void } = {}): Promise<LiveScan> {
  const courses = await api.courses(options.refresh, options.signal);
  const live: LiveLesson[] = [], failed: LiveCourse[] = [];
  for (let i = 0; i < courses.length; i += 4) {
    options.signal?.throwIfAborted();
    const batch = courses.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map(c => api.lessons(c.id, options.refresh, options.signal)));
    options.signal?.throwIfAborted();
    results.forEach((result, j) => {
      if (result.status === "rejected") failed.push(batch[j]);
      else for (const item of result.value) if (item.status === "1") live.push({ ...item, title: `${batch[j].title} · ${item.title}` });
    });
    options.progress?.(Math.min(i + 4, courses.length), courses.length);
  }
  return { live, failed, checked: courses.length };
}
