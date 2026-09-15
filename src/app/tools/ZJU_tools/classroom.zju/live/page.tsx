"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, PlayCircle, RefreshCcw } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import { fetchJson, formatFullDateTime, type Job, toolStatusLabel, ZjuAuthGate, ZjuErrorMessage, ZjuStatusPill, ZjuToolShell } from "../../courses.zju/_components";
import type { LiveCourse, LiveLesson, LiveScan, LiveStream } from "../../../../../lib/zju/live-core";
import Player from "./Player";

const endpoint = "/api/zju/classroom/live";
const numericId = (value: string) => /^\d{1,30}$/.test(value);
const statusLabel: Record<string, string> = { "1": "直播中", "2": "准备中", "6": "回放" };
export default function LivePage() {
  return <ZjuAuthGate callback="/tools/ZJU_tools/classroom.zju/live"><LiveContent /></ZjuAuthGate>;
}
function LiveContent() {
  const [courses, setCourses] = useState<LiveCourse[]>([]);
  const [lessons, setLessons] = useState<LiveLesson[]>([]);
  const [courseId, setCourseId] = useState("");
  const [subId, setSubId] = useState("");
  const [source, setSource] = useState<{ action: "today" | "lessons"; courseId?: string } | null>(null);
  const [heading, setHeading] = useState("课节列表");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LiveLesson | null>(null);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [streamIndex, setStreamIndex] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const activeJob = job && ["queued", "running"].includes(job.status);
  const disabled = Boolean(busy) || Boolean(activeJob);
  const stream = streams[streamIndex];

  useEffect(() => {
    const controller = new AbortController();
    void fetchJson<{ jobs: Job[] }>("/api/zju/jobs", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setJob(current => current ?? data.jobs.find(j => j.tool === "classroom.zju/live-scan" && ["queued", "running"].includes(j.status)) ?? null);
    }).catch(() => { /* A history read must not block the live entry points. */ });
    return () => controller.abort();
  }, []);

  async function perform(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "请求失败。"); }
    finally { lock.current = false; setBusy(""); }
  }
  async function readLessons(action: "today" | "lessons", id = "", refresh = false) {
    await perform("读取课节", async () => {
      setLessons([]); setSelected(null); setStreams([]); setSource(null);
      const params = new URLSearchParams({ action, courseId: id, refresh: refresh ? "1" : "0" });
      const data = await fetchJson<{ lessons: LiveLesson[] }>(`${endpoint}?${params}`);
      setLessons(data.lessons); setSource({ action, courseId: id });
      setHeading(action === "today" ? "今日全校直播" : `${courses.find(c => c.id === id)?.title || `课程 ${id}`} · 课节`);
      setQuery("");
    });
  }
  async function openLesson(item: LiveLesson) {
    await perform("读取播放链接", async () => {
      setSelected(item); setStreams([]); setStreamIndex(0);
      if (item.status === "6") {
        if (item.playbackUrl) setStreams([{ name: "回放", url: item.playbackUrl }]);
        else setNotice("该课节暂无回放链接。");
        return;
      }
      const params = new URLSearchParams({ action: "streams", subId: item.subId, courseId: item.courseId, type: item.type });
      const data = await fetchJson<{ streams: LiveStream[] }>(`${endpoint}?${params}`);
      setStreams(data.streams);
      if (!data.streams.length) setNotice("暂无直播画面。仅输入课节 ID 时，可补充课程 ID 后重试。");
    });
  }
  // Poll only this job; serial requests and cleanup prevent stale updates after navigation.
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await fetchJson<{ job: Job }>(`/api/zju/jobs/${job.id}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setJob(data.job);
        if (data.job.status === "succeeded") {
          const result = data.job.output as LiveScan;
          setLessons(result.live); setSource(null); setHeading("我的课程直播检测结果"); setQuery("");
          setNotice(result.failed.length ? `${result.failed.length} 门课程检测失败，结果不完整：${result.failed.map(c => c.title).join("、")}` : `已检测 ${result.checked} 门课程，发现 ${result.live.length} 节直播。`);
        } else if (data.job.status === "failed") setError(data.job.error || "检测失败。");
        if (["queued", "running"].includes(data.job.status)) timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "读取任务失败。"); timer = setTimeout(poll, 3000); }
      }
    };
    timer = setTimeout(poll, 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return <ZjuToolShell title="直播与回放播放器" eyebrow="智云课堂" backHref="/tools/ZJU_tools" backLabel="ZJU 工具" lead="浏览今日全校直播与我的课程，切换教师、课件等画面，或通过课程 ID、课节 ID 打开直播与回放。">
    <ZjuErrorMessage message={error} />
    {notice ? <p className="tool-account-meta" role="status">{notice}</p> : null}
    {busy ? <p role="status" className="tool-account-meta">{busy}中…</p> : null}
    <div className="zju-detail-layout">
      <div className="zju-side-stack">
        <DashboardCard className="tool-detail-card">
          <h2>直播入口</h2>
          <div className="tool-action-row">
            <button className="button primary-button" disabled={disabled} onClick={() => void readLessons("today")}><PlayCircle size={18} />今日全校直播</button>
            <button className="button secondary-button" disabled={disabled} onClick={() => void perform("创建检测任务", async () => {
              const data = await fetchJson<{ job: Job }>("/api/zju/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "classroom.zju/live-scan" }) });
              setJob(data.job); setLessons([]); setSource(null); setSelected(null); setStreams([]);
            })}>检测我的课程直播</button>
          </div>
          <p className="tool-account-meta">课程列表缓存 5 分钟，课节与今日直播缓存 1 分钟。刷新可立即重新读取。</p>
        </DashboardCard>
        <DashboardCard className="tool-detail-card zju-course-selector">
          <div className="zju-card-heading"><h2>我的课程</h2><button className="button secondary-button compact-button" disabled={disabled} onClick={() => void perform("刷新课程", async () => {
            const data = await fetchJson<{ courses: LiveCourse[] }>(`${endpoint}?action=courses&refresh=1`);
            setCourses(data.courses);
            if (!data.courses.length) setNotice("暂无课程，可手动输入课程 ID 查询。");
          })}>刷新课程</button></div>
          <select aria-label="选择我的课程" className="tool-select" disabled={disabled} value={courses.some(c => c.id === courseId) ? courseId : ""} onChange={e => setCourseId(e.target.value)}>
            <option value="">请选择课程</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title} · {c.teacher}</option>)}
          </select>
          <form className="tool-form" onSubmit={e => { e.preventDefault(); void readLessons("lessons", courseId); }}>
            <label><span>课程 ID（可查询其他可访问课程）</span><input inputMode="numeric" pattern="[0-9]{1,30}" value={courseId} onChange={e => setCourseId(e.target.value.trim())} disabled={disabled} /></label>
            <button className="button primary-button" disabled={disabled || !numericId(courseId)}>读取课程课节</button>
          </form>
          <form className="tool-form" onSubmit={e => { e.preventDefault(); void openLesson({ subId, courseId, type: "", title: `课节 ${subId}`, status: "", startAt: 0, room: "", playbackUrl: null }); }}>
            <label><span>课节 ID（sub_id）</span><input inputMode="numeric" pattern="[0-9]{1,30}" value={subId} onChange={e => setSubId(e.target.value.trim())} disabled={disabled} /></label>
            <button className="button secondary-button" disabled={disabled || !numericId(subId) || (courseId !== "" && !numericId(courseId))}>获取课节直播</button>
            <p className="tool-account-meta">课程 ID 可留空；填写后可尝试更多类型的直播。</p>
          </form>
        </DashboardCard>
      </div>
      <div className="zju-detail-main">
        {job ? <DashboardCard className="tool-detail-card zju-job">
          <div className="zju-card-heading"><h2>直播检测任务</h2><ZjuStatusPill tone={job.status === "failed" ? "danger" : activeJob ? "active" : "muted"}>{toolStatusLabel(job.status)}</ZjuStatusPill></div>
          {job.logs ? <pre className="tool-log-output">{job.logs}</pre> : <p>等待检测…</p>}
          {activeJob ? <button className="button secondary-button" disabled={Boolean(busy)} onClick={() => void perform("取消任务", async () => {
            await fetchJson(`/api/zju/jobs/${job.id}`, { method: "DELETE" });
            setJob(current => current ? { ...current, status: "cancelled" } : current);
          })}>取消检测</button> : null}
        </DashboardCard> : null}
        {selected ? <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading"><h2>{selected.title}</h2>{selected.status !== "6" ? <button className="button secondary-button compact-button" disabled={disabled} onClick={() => void openLesson(selected)}><RefreshCcw size={16} />刷新播放链接</button> : null}</div>
          {streams.length ? <>
            <label className="tool-form"><span>选择画面</span><select className="tool-select" value={streamIndex} onChange={e => { setStreamIndex(Number(e.target.value)); setNotice(""); }}>{streams.map((s, i) => <option key={`${s.name}-${i}`} value={i}>{s.name}</option>)}</select></label>
            {stream ? <><Player key={stream.url} url={stream.url} /><div className="tool-action-row">
              <button className="button secondary-button" onClick={() => void perform("复制链接", async () => { await navigator.clipboard.writeText(stream.url); setNotice("播放链接已复制。"); })}><Copy size={16} />复制链接</button>
              <a className="button secondary-button" href={stream.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />打开链接</a>
            </div></> : null}
            <p className="tool-account-meta">直播链接会过期，可刷新后重试。网页播放受上游跨域、来源校验与浏览器支持影响；无法播放时可复制到外部播放器。</p>
          </> : <p className="tool-empty">暂无可播放画面。</p>}
        </DashboardCard> : null}
        <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading"><h2>{heading}</h2>{source ? <button className="button secondary-button compact-button" disabled={disabled} onClick={() => void readLessons(source.action, source.courseId, true)}><RefreshCcw size={16} />刷新</button> : null}</div>
          <label className="tool-form"><span>搜索课节</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="标题或教室" /></label>
          <div className="zju-list">
            {lessons.filter(l => `${l.title} ${l.room}`.includes(query)).map((l, i) => <div className="zju-list-row" key={`${l.courseId}-${l.subId}-${i}`}>
              <div><strong>{l.title}</strong><span>{l.startAt ? formatFullDateTime(new Date(l.startAt * 1000).toISOString()) : "时间未提供"}{l.room ? ` · ${l.room}` : ""}</span></div>
              <div className="zju-row-side"><ZjuStatusPill tone={l.status === "1" ? "active" : "muted"}>{statusLabel[l.status] || `状态 ${l.status || "未知"}`}</ZjuStatusPill><button className="button secondary-button compact-button" disabled={disabled} onClick={() => void openLesson(l)}>打开{l.status === "6" ? "回放" : "直播"}</button></div>
            </div>)}
          </div>
          {!lessons.length ? <p className="tool-empty">{source || job?.status === "succeeded" ? "未发现符合条件的课节。" : "请选择直播入口，或读取课程课节。"}</p> : !lessons.some(l => `${l.title} ${l.room}`.includes(query)) ? <p className="tool-empty">没有匹配的课节。</p> : null}
        </DashboardCard>
      </div>
    </div>
  </ZjuToolShell>;
}
