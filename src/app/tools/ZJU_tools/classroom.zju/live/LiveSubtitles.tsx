"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { LiveLesson } from "../../../../../lib/zju/live-core";
import { activeCue, mergeSubtitleCues, type SubtitleCue, type SubtitleSnapshot } from "../../../../../lib/zju/subtitle-core";
import { fetchJson } from "../../courses.zju/_components";
const subscribePreferences = (listener: () => void) => { window.addEventListener("zju-subtitle-preference", listener); window.addEventListener("storage", listener); return () => { window.removeEventListener("zju-subtitle-preference", listener); window.removeEventListener("storage", listener); }; };
const endpoint = "/api/zju/classroom/live/subtitles";
const labels: Record<string, string> = { queued: "等待识别", running: "正在识别", idle: "识别已暂停", completed: "直播已结束", failed: "识别暂时中断", limited: "已达到识别限额", stopped: "管理员已停止识别" };
export type SubtitlePlayback = { sequence: number; start: number };
export default function LiveSubtitles({ lesson, video, playback, classroom }: { lesson: LiveLesson; video: RefObject<HTMLVideoElement | null>; playback: RefObject<SubtitlePlayback | null>; classroom: boolean }) {
  const identityKey = `${lesson.courseId}:${lesson.subId}`;
  const enabled = useSyncExternalStore(subscribePreferences, () => sessionStorage.getItem(`zju-subtitles:${identityKey}`) === "1", () => false);
  const setEnabled = (value: boolean) => { sessionStorage.setItem(`zju-subtitles:${identityKey}`, value ? "1" : "0"); window.dispatchEvent(new Event("zju-subtitle-preference")); };
  const [snapshot, setSnapshot] = useState<SubtitleSnapshot | null>(null), [cues, setCues] = useState<SubtitleCue[]>([]);
  const [error, setError] = useState(""), [text, setText] = useState(""), [offset, setOffset] = useState(0), [synchronized, setSynchronized] = useState(false);
  const clientId = useRef("");
  const cursor = useRef(-1);
  const textTrack = useRef<TextTrack | null>(null);
  useEffect(() => {
    clientId.current = crypto.randomUUID();
  }, [identityKey]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>, lastHeartbeat = 0;
    cursor.current = -1;
    const identity = { courseId: lesson.courseId, subId: lesson.subId, clientId: clientId.current };
    const mutate = (action: string, signal?: AbortSignal) => fetchJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, action }), signal });
    const poll = async () => {
      try {
        if (lesson.status === "1" && Date.now() - lastHeartbeat > 15000) { await mutate("heartbeat", controller.signal); lastHeartbeat = Date.now(); }
        const params = new URLSearchParams({ courseId: lesson.courseId, subId: lesson.subId, after: String(cursor.current) });
        const { subtitle } = await fetchJson<{ subtitle: SubtitleSnapshot | null }>(`${endpoint}?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSnapshot(previous => subtitle && previous?.id === subtitle.id ? { ...subtitle, segments: [...new Map([...previous.segments, ...subtitle.segments].map(s => [s.sequence, s])).values()].slice(-600) } : subtitle); setError("");
        if (subtitle) { setCues(previous => mergeSubtitleCues(previous, subtitle.cues, subtitle.reset)); cursor.current = subtitle.revision; }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "字幕连接中断，正在重试。"); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1200);
    };
    void (async () => {
      try { if (lesson.status === "1") await mutate("join", controller.signal); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "无法开启字幕。"); }
      if (!controller.signal.aborted) await poll();
    })();
    return () => { controller.abort(); clearTimeout(timer); void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, action: "leave" }), keepalive: true }).catch(() => {}); };
  }, [enabled, identityKey, lesson.courseId, lesson.subId, lesson.status]);
  useEffect(() => {
    const media = video.current; if (!media || !enabled || lesson.status !== "1") return;
    // Dynamic TextTrack cues survive native video fullscreen. The source remains untouched.
    const track = textTrack.current ??= media.addTextTrack("subtitles", "实时字幕", "zh"); track.mode = "showing";
    let last = "", cue: VTTCue | null = null;
    const tick = () => {
      const fragment = playback.current;
      const anchor = classroom && fragment ? snapshot?.segments.find(s => s.sequence === fragment.sequence) : null;
      const synced = !!anchor && !!fragment;
      setSynchronized(synced);
      let caption = "";
      if (synced) {
        const position = anchor!.startMs + (media.currentTime - fragment!.start) * 1000 + offset * 1000;
        caption = activeCue(cues, position);
        if (!caption && snapshot?.partialStartMs != null && snapshot.partialEndMs != null && position >= snapshot.partialStartMs && position <= snapshot.partialEndMs + 1000) caption = snapshot.partial;
      }
      else if (!media.paused) caption = snapshot?.partial || cues.at(-1)?.text || "";
      if (caption === last) return; last = caption; setText(caption);
      if (cue) { try { track.removeCue(cue); } catch {} }
      cue = caption ? new VTTCue(Math.max(0, media.currentTime - 0.1), media.currentTime + 30, caption) : null;
      if (cue) { cue.line = -3; track.addCue(cue); }
    };
    const timer = setInterval(tick, 200); tick();
    return () => { clearInterval(timer); track.mode = "disabled"; if (cue) { try { track.removeCue(cue); } catch {} } };
  }, [video, playback, enabled, classroom, snapshot, cues, offset, lesson.status]);
  return <div className="zju-live-subtitles">
    <div className="tool-action-row">
      <button className={`button ${enabled ? "primary-button" : "secondary-button"}`} type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>字幕{enabled ? "：开" : "：关"}</button>
      {enabled ? <span className="tool-account-meta" role="status">{snapshot ? lesson.status !== "1" ? "直播已结束" : labels[snapshot.status] || snapshot.status : "正在读取字幕"}{snapshot?.viewers ? ` · ${snapshot.viewers} 个观看窗口共享` : ""}</span> : null}
    </div>
    {enabled ? <>
      {error ? <p className="auth-message error" role="alert">{error}</p> : null}
      <p className="tool-account-meta">{lesson.status !== "1" ? "显示已保存的直播转写记录，时间从首次记录算起" : synchronized ? "字幕跟随播放进度；切换画面共享教室音源" : "当前显示实时转写，可能与画面有时间差；切换画面共享教室音源"}。字幕保存 7 天。</p>
      {synchronized ? <label className="zju-subtitle-offset">字幕时间调整（秒）<input type="number" min="-30" max="30" step="0.5" value={offset} onChange={e => setOffset(Math.max(-30, Math.min(30, Number(e.target.value) || 0)))} /></label> : null}
      {!text && snapshot?.status === "running" ? <p className="tool-account-meta">等待当前播放位置的字幕…</p> : null}
      {snapshot?.error ? <p className="tool-account-meta">{snapshot.error}</p> : null}
      <details className="zju-subtitle-history"><summary>查看已保存字幕（{cues.length} 句）</summary>
        <div className="zju-subtitle-transcript">{cues.length ? cues.map(c => <p key={c.id}><time>{`${Math.floor(c.startMs / 60000)}:${String(Math.floor(c.startMs / 1000) % 60).padStart(2, "0")}`}</time>{c.text}</p>) : <p className="tool-empty">尚无已确定字幕；从首次开启时开始记录。</p>}</div>
        {snapshot ? <p className="tool-account-meta">保存至 {new Date(snapshot.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p> : null}
      </details>
    </> : null}
  </div>;
}
