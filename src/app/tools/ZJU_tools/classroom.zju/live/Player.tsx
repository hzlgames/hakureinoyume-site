"use client";
import { useEffect, useRef, useState } from "react";

import type { LiveLesson } from "../../../../../lib/zju/live-core";
import LiveSubtitles, { type SubtitlePlayback } from "./LiveSubtitles";

export default function Player({ url, lesson, classroom = false }: { url: string; lesson?: LiveLesson; classroom?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const playback = useRef<SubtitlePlayback | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const video = ref.current;
    if (!video || !url) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    const fail = () => setError("暂时无法在网页播放。请刷新播放链接，或复制链接到外部播放器打开。");
    const isHls = /\.m3u8(?:[?#]|$)/i.test(url);
    if (!isHls) video.src = url;
    else {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed) return;
        // Chromium can report native HLS as "maybe" and still fail to decode it.
        // Prefer HLS.js; keep native HLS for browsers without MediaSource support.
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = url;
          else fail();
          return;
        }
        const hls = new Hls();
        destroy = () => hls.destroy();
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { fail(); hls.destroy(); } });
        hls.on(Hls.Events.FRAG_CHANGED, (_event, data) => { if (typeof data.frag.sn === "number") playback.current = { sequence: data.frag.sn, start: data.frag.start }; });
        hls.loadSource(url);
        hls.attachMedia(video);
      }).catch(fail);
    }
    return () => { disposed = true; destroy?.(); video.pause(); video.removeAttribute("src"); video.load(); };
  }, [url]);
  return <>
    {url ? <video aria-label="智云课堂播放器" className="zju-live-video" controls playsInline ref={ref} onError={() => setError("播放失败，请刷新链接或使用外部播放器。")} /> : null}
    {lesson?.courseId && lesson.subId ? <LiveSubtitles lesson={lesson} video={ref} playback={playback} classroom={classroom} /> : null}
    {error ? <p role="alert" className="auth-message error">{error}</p> : null}
  </>;
}
