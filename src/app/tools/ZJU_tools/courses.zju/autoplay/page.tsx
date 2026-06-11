"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Gauge, Link2, PlayCircle, RefreshCcw, Search, Video, XCircle, Zap } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import {
  Course,
  CoursePicker,
  fetchJson,
  formatFullDateTime,
  Job,
  toolStatusLabel,
  toolStatusTone,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../_components";

type Activity = {
  done: boolean;
  duration: number;
  id: number | string;
  kind: "material" | "video" | "view";
  title: string;
  type: string;
};

type AutoplaySummary = {
  after?: number;
  before?: number;
  fail?: number;
  ok?: number;
  skipped?: number;
};

const SPEED_OPTIONS = [2, 4, 8, 16];

const kindMeta: Record<Activity["kind"], { icon: typeof Video; label: string }> = {
  material: { icon: FileText, label: "资料" },
  video: { icon: Video, label: "视频" },
  view: { icon: Link2, label: "页面" }
};

function formatDuration(seconds: number) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}秒`;
  return rest ? `${minutes}分${rest}秒` : `${minutes}分钟`;
}

function readSummary(output: unknown): AutoplaySummary | null {
  if (typeof output !== "object" || output === null || !("summary" in output)) return null;
  const summary = (output as { summary?: unknown }).summary;
  return typeof summary === "object" && summary !== null ? summary as AutoplaySummary : null;
}

export default function ZjuAutoplayPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());
  const [speed, setSpeed] = useState(4);
  const [realistic, setRealistic] = useState(false);
  const [force, setForce] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading("courses");
    setError("");
    try {
      const payload = await fetchJson<{ courses?: Course[] }>("/api/zju/courses");
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
      setJobs((payload.jobs ?? []).filter((job) => job.tool === "courses.zju/autoplay"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务读取失败。");
    }
  }, []);

  const loadActivities = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("activities");
    setError("");
    try {
      const payload = await fetchJson<{ activities?: Activity[] }>(`/api/zju/courses/${selectedCourseId}/activities`);
      setActivities(payload.activities ?? []);
      setSelectedActivities(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "活动读取失败。");
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

  const filteredActivities = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return activities;
    return activities.filter((activity) => `${activity.title} ${activity.type}`.toLowerCase().includes(keyword));
  }, [activities, query]);

  const pendingActivities = useMemo(() => activities.filter((activity) => !activity.done), [activities]);
  const totalVideoSeconds = useMemo(
    () => activities.filter((activity) => activity.kind === "video" && !activity.done).reduce((sum, activity) => sum + activity.duration, 0),
    [activities]
  );

  function selectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setActivities([]);
    setSelectedActivities(new Set());
    setQuery("");
  }

  function toggleActivity(id: string, checked: boolean) {
    setSelectedActivities((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleVisible(checked: boolean) {
    setSelectedActivities((current) => {
      const next = new Set(current);
      for (const activity of filteredActivities) {
        if (activity.done) continue;
        if (checked) next.add(String(activity.id));
        else next.delete(String(activity.id));
      }
      return next;
    });
  }

  const selectableVisible = filteredActivities.filter((activity) => !activity.done);
  const allVisibleSelected = selectableVisible.length > 0
    && selectableVisible.every((activity) => selectedActivities.has(String(activity.id)));

  async function startAutoplay() {
    if (!selectedCourseId) return;
    setLoading("start");
    setError("");
    try {
      await fetchJson<{ job?: Job }>("/api/zju/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "courses.zju/autoplay",
          courseId: selectedCourseId,
          speed,
          concurrency: realistic ? 1 : 0,
          force,
          selectedIds: [...selectedActivities]
        })
      });
      setSelectedActivities(new Set());
      await loadJobs();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "任务启动失败。");
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

  const targetCount = selectedActivities.size > 0 ? selectedActivities.size : pendingActivities.length;

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju/autoplay">
      <ZjuToolShell
        actions={(
          <button
            className="button primary-button"
            disabled={!selectedCourseId || targetCount === 0 || loading === "start"}
            onClick={startAutoplay}
            type="button"
          >
            <PlayCircle size={18} />
            {loading === "start" ? "创建中" : selectedActivities.size > 0 ? `刷选中 ${selectedActivities.size}` : "刷全部未完成"}
          </button>
        )}
        lead="按真实播放节奏的倍速上报观看进度，自动完成视频、页面与资料活动；可逐项挑选并随时取消。"
        title="自动刷课"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-detail-layout">
          <div className="zju-side-stack">
            <CoursePicker
              courses={courses}
              disabled={loading === "courses"}
              onRefresh={loadCourses}
              onSelect={selectCourse}
              selectedCourseId={selectedCourseId}
            />

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Gauge size={18} />
                  播放节奏
                </div>
              </div>
              <div className="zju-speed-grid">
                {SPEED_OPTIONS.map((option) => (
                  <button
                    className={`zju-speed-chip ${speed === option ? "is-active" : ""}`}
                    key={option}
                    onClick={() => setSpeed(option)}
                    type="button"
                  >
                    {option}×
                  </button>
                ))}
              </div>
              <label className="zju-switch-row">
                <span>
                  <strong>拟真串行</strong>
                  <small>一次只“看”一个视频，最像真人但更慢</small>
                </span>
                <input checked={realistic} onChange={(event) => setRealistic(event.target.checked)} type="checkbox" />
              </label>
              <label className="zju-switch-row">
                <span>
                  <strong>强制重刷</strong>
                  <small>不跳过已完成的活动</small>
                </span>
                <input checked={force} onChange={(event) => setForce(event.target.checked)} type="checkbox" />
              </label>

              <div className="tool-action-row zju-rhythm-actions">
                <button className="button secondary-button" disabled={!selectedCourseId || loading === "activities"} onClick={loadActivities} type="button">
                  <RefreshCcw size={18} />
                  {loading === "activities" ? "读取中" : "读取活动"}
                </button>
                <button className="button secondary-button" disabled={selectableVisible.length === 0} onClick={() => toggleVisible(!allVisibleSelected)} type="button">
                  {allVisibleSelected ? "取消全选" : "全选未完成"}
                </button>
              </div>
            </DashboardCard>
          </div>

          <div className="zju-detail-main">
            <div className="zju-metric-grid">
              <ZjuMetricCard detail="可自动完成的活动" label="待刷活动" value={pendingActivities.length} />
              <ZjuMetricCard detail={selectedActivities.size > 0 ? "已手动挑选" : "默认刷全部未完成"} label="本次目标" value={targetCount} />
              <ZjuMetricCard detail={`${speed}× 下约 ${Math.max(1, Math.round(totalVideoSeconds / speed / 60))} 分钟`} label="视频总时长" value={formatDuration(totalVideoSeconds) ?? "—"} />
            </div>

            <DashboardCard className="tool-detail-card zju-control-card">
              <label className="zju-search-field">
                <Search size={16} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索活动标题或类型"
                  type="search"
                  value={query}
                />
              </label>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Zap size={18} />
                  课程活动
                </div>
                <ZjuStatusPill tone="muted">{filteredActivities.length} / {activities.length}</ZjuStatusPill>
              </div>
              <div className="zju-material-list">
                {filteredActivities.length === 0 ? (
                  <p className="tool-empty">{loading === "activities" ? "正在读取活动..." : "读取活动后即可挑选要自动完成的项目。"}</p>
                ) : null}
                {filteredActivities.map((activity, index) => {
                  const id = String(activity.id);
                  const meta = kindMeta[activity.kind];
                  const Icon = meta.icon;
                  const checked = selectedActivities.has(id);
                  return (
                    <label
                      className={`zju-activity-row ${activity.done ? "is-done" : ""} ${checked ? "is-selected" : ""}`}
                      key={id}
                      style={{ animationDelay: `${Math.min(index * 28, 320)}ms` }}
                    >
                      <input
                        checked={checked}
                        disabled={activity.done}
                        onChange={(event) => toggleActivity(id, event.target.checked)}
                        type="checkbox"
                      />
                      <span className="zju-activity-icon">
                        <Icon size={18} />
                      </span>
                      <div className="zju-activity-body">
                        <strong>{activity.title}</strong>
                        <div className="zju-tag-row">
                          <span>{meta.label}</span>
                          {activity.duration ? <span>{formatDuration(activity.duration)}</span> : null}
                        </div>
                      </div>
                      {activity.done ? (
                        <span className="zju-activity-done">
                          <CheckCircle2 size={16} />
                          已完成
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <PlayCircle size={18} />
                  刷课任务
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无刷课任务。</p> : null}
                {jobs.map((job) => {
                  const active = ["queued", "running"].includes(job.status);
                  const summary = readSummary(job.output);
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
                      {summary ? (
                        <div className="zju-summary-row">
                          <span><strong>{summary.ok ?? 0}</strong>成功</span>
                          <span><strong>{summary.fail ?? 0}</strong>失败</span>
                          <span><strong>{summary.skipped ?? 0}</strong>跳过</span>
                          {typeof summary.before === "number" && typeof summary.after === "number" ? (
                            <span><strong>{summary.before} → {summary.after}</strong>完成数</span>
                          ) : null}
                        </div>
                      ) : null}
                      <pre>{job.logs || job.error || "等待开始..."}</pre>
                      {job.error && job.logs ? <p className="zju-job-error">{job.error}</p> : null}
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
