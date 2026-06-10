"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  Download,
  ExternalLink,
  FileDown,
  GraduationCap,
  ListChecks,
  RefreshCcw,
  XCircle
} from "lucide-react";
import { DashboardCard } from "../../../_components/ui";
import { useSession } from "../../../../lib/auth-client";

type Course = {
  code: string;
  id: number;
  instructors: string[];
  name: string;
  status: string;
};

type Todo = {
  courseId?: number | string | null;
  courseName: string;
  dueAt: string | null;
  id: number | string;
  source: "courses.zju" | "pintia";
  title: string;
  type: string;
  url: string;
};

type Score = {
  id: number | string;
  score: string;
  title: string;
  type: "作业" | "考试";
};

type Material = {
  activityId: number | string;
  activityTitle: string;
  createdAt: string | null;
  id: number | string;
  name: string;
  size: number;
};

type Job = {
  id: string;
  createdAt: string;
  error: string | null;
  logs: string;
  output: unknown;
  status: string;
  tool: string;
};

function formatDate(value: string | null) {
  if (!value) return "无截止时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${Math.round(size / Math.pow(1024, index))} ${units[index]}`;
}

function outputFiles(output: unknown): Array<{ name: string; size: number }> {
  if (typeof output !== "object" || output === null || !("files" in output)) return [];
  const files = (output as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];

  return files
    .filter((item): item is { name: string; size: number } => {
      return typeof item === "object"
        && item !== null
        && typeof (item as { name?: unknown }).name === "string"
        && typeof (item as { size?: unknown }).size === "number";
    });
}

export default function CoursesZjuPage() {
  const { data: session, isPending } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/zju/jobs");
    if (!response.ok) return;
    const payload = await response.json() as { jobs: Job[] };
    setJobs(payload.jobs);
  }, []);

  const loadCourses = useCallback(async () => {
    setLoading("courses");
    setError("");
    try {
      const response = await fetch("/api/zju/courses");
      const payload = await response.json() as { courses?: Course[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "课程读取失败。");
      setCourses(payload.courses ?? []);
      setSelectedCourseId((current) => current || String(payload.courses?.[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "课程读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  const loadTodos = useCallback(async () => {
    setLoading("todos");
    setError("");
    try {
      const response = await fetch("/api/zju/courses/todos");
      const payload = await response.json() as { todos?: Todo[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "待办读取失败。");
      setTodos(payload.todos ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "待办读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  const loadScores = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("scores");
    setError("");
    try {
      const response = await fetch(`/api/zju/courses/${selectedCourseId}/scores`);
      const payload = await response.json() as { scores?: Score[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "分数读取失败。");
      setScores(payload.scores ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "分数读取失败。");
    } finally {
      setLoading("");
    }
  }, [selectedCourseId]);

  const loadMaterials = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("materials");
    setError("");
    try {
      const response = await fetch(`/api/zju/courses/${selectedCourseId}/materials`);
      const payload = await response.json() as { materials?: Material[]; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "资料读取失败。");
      setMaterials(payload.materials ?? []);
      setSelectedMaterials(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "资料读取失败。");
    } finally {
      setLoading("");
    }
  }, [selectedCourseId]);

  useEffect(() => {
    if (!session?.user) return;
    const timer = window.setTimeout(() => {
      void loadCourses();
      void loadTodos();
      void loadJobs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCourses, loadJobs, loadTodos, session?.user]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "running"].includes(job.status))) return;
    const timer = window.setInterval(() => void loadJobs(), 1800);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  async function startDownload() {
    if (!selectedCourseId) return;
    setLoading("download");
    setError("");
    const response = await fetch("/api/zju/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        tool: "courses.zju/materialDown",
        courseId: selectedCourseId,
        selectedIds: [...selectedMaterials]
      })
    });
    const payload = await response.json() as { message?: string };
    setLoading("");
    if (!response.ok) {
      setError(payload.message ?? "任务启动失败。");
      return;
    }
    await loadJobs();
  }

  async function cancelJob(jobId: string) {
    await fetch(`/api/zju/jobs/${jobId}`, {
      method: "DELETE"
    });
    await loadJobs();
  }

  if (isPending) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card">加载中...</DashboardCard>
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card">
          <p className="eyebrow">courses.zju</p>
          <h1>请先登录</h1>
          <p className="lead">登录后才能使用 ZJU 工具。</p>
          <Link className="button primary-button tool-inline-button" href="/login?callback=/tools/ZJU_tools/courses.zju">登录</Link>
        </DashboardCard>
      </section>
    );
  }

  return (
    <section className="page-shell tools-page zju-tool-page">
      <div className="intro tools-intro">
        <p className="eyebrow">courses.zju</p>
        <h1>学在浙大</h1>
        <p className="lead">以网页方式查看待办、课程、成绩和资料下载任务。</p>
      </div>

      {error ? <p className="auth-message error zju-page-message">{error}</p> : null}

      <div className="zju-tools-grid">
        <DashboardCard className="tool-detail-card zju-course-panel">
          <div className="card-header">
            <div className="card-title">
              <GraduationCap size={18} />
              课程
            </div>
            <button className="icon-action-button" onClick={loadCourses} title="刷新课程" type="button">
              <RefreshCcw size={17} />
            </button>
          </div>
          <select
            className="tool-select"
            onChange={(event) => setSelectedCourseId(event.target.value)}
            value={selectedCourseId}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          {selectedCourse ? (
            <div className="zju-course-meta">
              <p>{selectedCourse.code || "无课程代码"}</p>
              <p>{selectedCourse.instructors.join(" / ") || "教师信息未提供"}</p>
            </div>
          ) : (
            <p className="tool-empty">还没有课程数据。请先确认 ZJU 账号已保存。</p>
          )}
          <div className="tool-action-row">
            <button className="button secondary-button" disabled={!selectedCourseId || loading === "scores"} onClick={loadScores} type="button">
              <BookOpen size={18} />
              查分数
            </button>
            <button className="button secondary-button" disabled={!selectedCourseId || loading === "materials"} onClick={loadMaterials} type="button">
              <FileDown size={18} />
              查资料
            </button>
          </div>
        </DashboardCard>

        <DashboardCard className="tool-detail-card">
          <div className="card-header">
            <div className="card-title">
              <ListChecks size={18} />
              待办
            </div>
            <button className="icon-action-button" onClick={loadTodos} title="刷新待办" type="button">
              <RefreshCcw size={17} />
            </button>
          </div>
          <div className="zju-list">
            {todos.length === 0 ? <p className="tool-empty">{loading === "todos" ? "读取中..." : "暂无待办。"}</p> : null}
            {todos.map((todo) => (
              <a className="zju-list-row" href={todo.url} key={`${todo.source}-${todo.id}`} rel="noreferrer" target="_blank">
                <div>
                  <strong>{todo.title}</strong>
                  <span>{todo.courseName} · {todo.type}</span>
                </div>
                <div className="zju-row-side">
                  <span>{formatDate(todo.dueAt)}</span>
                  <ExternalLink size={14} />
                </div>
              </a>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard className="tool-detail-card">
          <div className="card-header">
            <div className="card-title">
              <BookOpen size={18} />
              作业与考试分数
            </div>
          </div>
          <div className="zju-list">
            {scores.length === 0 ? <p className="tool-empty">选择课程后点击“查分数”。</p> : null}
            {scores.map((score) => (
              <div className="zju-list-row" key={`${score.type}-${score.id}`}>
                <div>
                  <strong>{score.title}</strong>
                  <span>{score.type}</span>
                </div>
                <span className="tool-status-pill">{score.score}</span>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard className="tool-detail-card zju-materials-card">
          <div className="card-header">
            <div className="card-title">
              <FileDown size={18} />
              课程资料
            </div>
            <button
              className="button primary-button compact-button"
              disabled={!selectedCourseId || selectedMaterials.size === 0 || loading === "download"}
              onClick={startDownload}
              type="button"
            >
              <Download size={16} />
              下载选中
            </button>
          </div>
          <div className="zju-list">
            {materials.length === 0 ? <p className="tool-empty">选择课程后点击“查资料”。</p> : null}
            {materials.map((material) => {
              const checked = selectedMaterials.has(String(material.id));
              return (
                <label className="zju-list-row zju-checkbox-row" key={String(material.id)}>
                  <input
                    checked={checked}
                    onChange={(event) => {
                      const next = new Set(selectedMaterials);
                      if (event.target.checked) {
                        next.add(String(material.id));
                      } else {
                        next.delete(String(material.id));
                      }
                      setSelectedMaterials(next);
                    }}
                    type="checkbox"
                  />
                  <div>
                    <strong>{material.name}</strong>
                    <span>{material.activityTitle} · {formatSize(material.size)}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </DashboardCard>

        <DashboardCard className="tool-detail-card zju-jobs-card">
          <div className="card-header">
            <div className="card-title">
              <Download size={18} />
              下载任务
            </div>
            <button className="icon-action-button" onClick={loadJobs} title="刷新任务" type="button">
              <RefreshCcw size={17} />
            </button>
          </div>
          <div className="zju-list">
            {jobs.length === 0 ? <p className="tool-empty">暂无任务。</p> : null}
            {jobs.map((job) => {
              const files = outputFiles(job.output);
              const active = ["queued", "running"].includes(job.status);
              return (
                <div className="zju-job" key={job.id}>
                  <div className="zju-job-header">
                    <span className="tool-status-pill">{job.status}</span>
                    {active ? (
                      <button className="icon-action-button" onClick={() => void cancelJob(job.id)} title="取消任务" type="button">
                        <XCircle size={17} />
                      </button>
                    ) : null}
                  </div>
                  <pre>{job.logs || job.error || "等待开始..."}</pre>
                  {files.length > 0 ? (
                    <div className="zju-file-links">
                      {files.map((file) => (
                        <a href={`/api/zju/jobs/${job.id}/files/${encodeURIComponent(file.name)}`} key={file.name}>
                          <Download size={14} />
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

        <DashboardCard className="tool-detail-card zju-disabled-card">
          <div className="card-header">
            <div className="card-title">
              <Ban size={18} />
              未开放网页执行
            </div>
          </div>
          <p>原命令行中的视频完成请求与测验答案读取不会接入网页操作。这里仅保留正常查看和资料下载类工具。</p>
        </DashboardCard>
      </div>
    </section>
  );
}
