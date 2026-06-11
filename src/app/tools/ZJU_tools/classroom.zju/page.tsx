"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FileText, MonitorPlay, RefreshCcw, Search, Video, XCircle } from "lucide-react";
import { DashboardCard } from "../../../_components/ui";
import {
  fetchJson,
  formatFullDateTime,
  formatSize,
  Job,
  outputFiles,
  toolStatusLabel,
  toolStatusTone,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../courses.zju/_components";

type ClassroomCourse = {
  id: string;
  teacher: string;
  title: string;
};

type ClassroomVideo = {
  courseId: string;
  playbackUrl: string | null;
  startAt: number;
  subId: string;
  title: string;
};

function timeAgo(seconds: number) {
  if (!seconds) return "未知时间";
  const diff = (Date.now() - seconds * 1000) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))} 个月前`;
  return `${Math.floor(diff / (86400 * 365))} 年前`;
}

export default function ZjuClassroomPage() {
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [videos, setVideos] = useState<ClassroomVideo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading("courses");
    setError("");
    try {
      const payload = await fetchJson<{ courses?: ClassroomCourse[] }>("/api/zju/classroom/courses");
      const nextCourses = payload.courses ?? [];
      setCourses(nextCourses);
      setSelectedCourseId((current) => current || String(nextCourses[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "课程读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const payload = await fetchJson<{ jobs?: Job[] }>("/api/zju/jobs");
      setJobs((payload.jobs ?? []).filter((job) => job.tool === "classroom.zju/transcript"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务读取失败。");
    }
  }, []);

  const loadVideos = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("videos");
    setError("");
    try {
      const payload = await fetchJson<{ videos?: ClassroomVideo[] }>(`/api/zju/classroom/courses/${selectedCourseId}/videos`);
      setVideos(payload.videos ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "视频读取失败。");
    } finally {
      setLoading("");
    }
  }, [selectedCourseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCourses();
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCourses, loadJobs]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "running"].includes(job.status))) return;
    const timer = window.setInterval(() => void loadJobs().catch(() => undefined), 1800);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  const filteredVideos = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return videos;
    return videos.filter((video) => video.title.toLowerCase().includes(keyword));
  }, [videos, query]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  function selectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setVideos([]);
    setQuery("");
  }

  async function copyUrl(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? "" : current)), 1600);
    } catch {
      setError("复制失败，请手动复制链接。");
    }
  }

  async function exportTranscript(video: ClassroomVideo) {
    setLoading(`transcript-${video.subId}`);
    setError("");
    try {
      await fetchJson<{ job?: Job }>("/api/zju/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "classroom.zju/transcript",
          courseId: video.courseId || selectedCourseId,
          subId: video.subId,
          title: video.title
        })
      });
      await loadJobs();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "转录任务创建失败。");
    } finally {
      setLoading("");
    }
  }

  async function cancelJob(jobId: string) {
    setError("");
    try {
      await fetchJson<{ ok: boolean }>(`/api/zju/jobs/${jobId}`, { method: "DELETE" });
      await loadJobs();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "任务取消失败。");
    }
  }

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/classroom.zju">
      <ZjuToolShell
        actions={(
          <button className="button primary-button" disabled={!selectedCourseId || loading === "videos"} onClick={loadVideos} type="button">
            <RefreshCcw size={18} />
            {loading === "videos" ? "读取中" : "读取录播"}
          </button>
        )}
        backHref="/tools/ZJU_tools"
        backLabel="ZJU 工具"
        eyebrow="智云课堂"
        lead="读取智云课堂录播，复制回放链接在外部播放器打开，或导出 PPT 截图与字幕组成的 Markdown 转录。"
        title="课堂录播"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-detail-layout">
          <div className="zju-side-stack">
            <DashboardCard className="tool-detail-card zju-course-selector">
              <div className="zju-card-heading">
                <div className="card-title">
                  <MonitorPlay size={18} />
                  选择课程
                </div>
                <button className="button secondary-button compact-button" disabled={loading === "courses"} onClick={loadCourses} type="button">
                  刷新课程
                </button>
              </div>
              <select
                className="tool-select"
                disabled={loading === "courses" || courses.length === 0}
                onChange={(event) => selectCourse(event.target.value)}
                value={selectedCourseId}
              >
                {courses.length === 0 ? <option value="">暂无课程</option> : null}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              {selectedCourse ? (
                <dl className="zju-course-facts">
                  <div>
                    <dt>授课教师</dt>
                    <dd>{selectedCourse.teacher || "未提供"}</dd>
                  </div>
                  <div>
                    <dt>课程 ID</dt>
                    <dd>{selectedCourse.id}</dd>
                  </div>
                </dl>
              ) : (
                <p className="tool-empty">点击刷新课程后选择一门课程。</p>
              )}
            </DashboardCard>

            <DashboardCard className="tool-detail-card zju-control-card">
              <label className="zju-search-field">
                <Search size={16} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索录播标题"
                  type="search"
                  value={query}
                />
              </label>
            </DashboardCard>
          </div>

          <div className="zju-detail-main">
            <div className="zju-metric-grid">
              <ZjuMetricCard detail="当前课程录播" label="录播数" value={videos.length} />
              <ZjuMetricCard detail="可复制回放链接" label="可播放" value={videos.filter((video) => video.playbackUrl).length} />
              <ZjuMetricCard detail="最近的转录任务" label="转录任务" value={jobs.length} />
            </div>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Video size={18} />
                  录播列表
                </div>
                <ZjuStatusPill tone="muted">{filteredVideos.length} / {videos.length}</ZjuStatusPill>
              </div>
              <div className="zju-material-list">
                {filteredVideos.length === 0 ? (
                  <p className="tool-empty">{loading === "videos" ? "正在读取录播..." : "读取录播后即可复制链接或导出转录。"}</p>
                ) : null}
                {filteredVideos.map((video, index) => (
                  <div
                    className="zju-activity-row zju-replay-row"
                    key={video.subId}
                    style={{ animationDelay: `${Math.min(index * 28, 320)}ms` }}
                  >
                    <span className="zju-activity-icon">
                      <Video size={18} />
                    </span>
                    <div className="zju-activity-body">
                      <strong>{video.title}</strong>
                      <div className="zju-tag-row">
                        <span>{timeAgo(video.startAt)}</span>
                        {video.playbackUrl ? null : <span>无回放链接</span>}
                      </div>
                    </div>
                    <div className="zju-replay-actions">
                      {video.playbackUrl ? (
                        <>
                          <button
                            className="button secondary-button compact-button"
                            onClick={() => copyUrl(video.playbackUrl as string, video.subId)}
                            type="button"
                          >
                            <Copy size={15} />
                            {copied === video.subId ? "已复制" : "复制链接"}
                          </button>
                          <a className="icon-action-button" href={video.playbackUrl} rel="noreferrer" target="_blank" title="在新标签打开">
                            <ExternalLink size={16} />
                          </a>
                        </>
                      ) : null}
                      <button
                        className="button secondary-button compact-button"
                        disabled={loading === `transcript-${video.subId}`}
                        onClick={() => exportTranscript(video)}
                        type="button"
                      >
                        <FileText size={15} />
                        {loading === `transcript-${video.subId}` ? "创建中" : "导出转录"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <FileText size={18} />
                  转录任务
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无转录任务。</p> : null}
                {jobs.map((job) => {
                  const files = outputFiles(job.output);
                  const active = ["queued", "running"].includes(job.status);
                  return (
                    <div className="zju-job" key={job.id}>
                      <div className="zju-job-header">
                        <div>
                          <ZjuStatusPill tone={toolStatusTone(job.status)}>{toolStatusLabel(job.status)}</ZjuStatusPill>
                          <span>{formatFullDateTime(job.createdAt)}</span>
                        </div>
                        {active ? (
                          <button className="icon-action-button" onClick={() => void cancelJob(job.id)} title="取消任务" type="button">
                            <XCircle size={17} />
                          </button>
                        ) : null}
                      </div>
                      <pre>{job.logs || job.error || "等待开始..."}</pre>
                      {job.error && job.logs ? <p className="zju-job-error">{job.error}</p> : null}
                      {files.length > 0 ? (
                        <div className="zju-file-links">
                          {files.map((file) => (
                            <a href={`/api/zju/jobs/${job.id}/files/${encodeURIComponent(file.name)}`} key={file.name}>
                              <FileText size={14} />
                              {file.name} · {formatSize(file.size)}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </DashboardCard>
          </div>
        </div>
      </ZjuToolShell>
    </ZjuAuthGate>
  );
}
