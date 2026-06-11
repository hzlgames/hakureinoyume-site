"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileDown, RefreshCcw, Search, XCircle } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import {
  Course,
  CoursePicker,
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
} from "../_components";

type Material = {
  activityId: number | string;
  activityTitle: string;
  createdAt: string | null;
  id: number | string;
  name: string;
  size: number;
};

export default function ZjuMaterialsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
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
      setJobs(payload.jobs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务读取失败。");
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("materials");
    setError("");
    try {
      const payload = await fetchJson<{ materials?: Material[] }>(`/api/zju/courses/${selectedCourseId}/materials`);
      setMaterials(payload.materials ?? []);
      setSelectedMaterials(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "资料读取失败。");
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

  const filteredMaterials = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return materials;
    return materials.filter((material) => `${material.name} ${material.activityTitle}`.toLowerCase().includes(keyword));
  }, [materials, query]);

  const selectedSize = materials
    .filter((material) => selectedMaterials.has(String(material.id)))
    .reduce((sum, material) => sum + material.size, 0);

  async function startDownload() {
    if (!selectedCourseId || selectedMaterials.size === 0) return;
    setLoading("download");
    setError("");
    try {
      await fetchJson<{ job?: Job }>("/api/zju/jobs", {
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
      setSelectedMaterials(new Set());
      await loadJobs();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "任务启动失败。");
    } finally {
      setLoading("");
    }
  }

  async function cancelJob(jobId: string) {
    setError("");
    try {
      await fetchJson<{ ok: boolean }>(`/api/zju/jobs/${jobId}`, {
        method: "DELETE"
      });
      await loadJobs();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "任务取消失败。");
    }
  }

  function selectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setMaterials([]);
    setSelectedMaterials(new Set());
    setQuery("");
  }

  function toggleMaterial(id: string, checked: boolean) {
    setSelectedMaterials((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleVisibleMaterials(checked: boolean) {
    setSelectedMaterials((current) => {
      const next = new Set(current);
      for (const material of filteredMaterials) {
        if (checked) {
          next.add(String(material.id));
        } else {
          next.delete(String(material.id));
        }
      }
      return next;
    });
  }

  const allVisibleSelected = filteredMaterials.length > 0
    && filteredMaterials.every((material) => selectedMaterials.has(String(material.id)));

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju/materials">
      <ZjuToolShell
        actions={(
          <button
            className="button primary-button"
            disabled={!selectedCourseId || selectedMaterials.size === 0 || loading === "download"}
            onClick={startDownload}
            type="button"
          >
            <Download size={18} />
            {loading === "download" ? "创建中" : "下载选中"}
          </button>
        )}
        lead="按课程浏览资料，筛选文件后创建下载任务；任务日志、取消和文件下载都在同一页处理。"
        title="课程资料"
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
                  <FileDown size={18} />
                  操作
                </div>
              </div>
              <div className="tool-action-row">
                <button className="button secondary-button" disabled={!selectedCourseId || loading === "materials"} onClick={loadMaterials} type="button">
                  <RefreshCcw size={18} />
                  {loading === "materials" ? "读取中" : "读取资料"}
                </button>
                <button className="button secondary-button" disabled={filteredMaterials.length === 0} onClick={() => toggleVisibleMaterials(!allVisibleSelected)} type="button">
                  {allVisibleSelected ? "取消全选" : "全选可见"}
                </button>
              </div>
            </DashboardCard>
          </div>

          <div className="zju-detail-main">
            <div className="zju-metric-grid">
              <ZjuMetricCard detail="当前课程资料" label="文件数" value={materials.length} />
              <ZjuMetricCard detail={formatSize(selectedSize)} label="已选文件" value={selectedMaterials.size} />
              <ZjuMetricCard detail="最近 20 条" label="任务数" value={jobs.length} />
            </div>

            <DashboardCard className="tool-detail-card zju-control-card">
              <label className="zju-search-field">
                <Search size={16} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文件名或资料活动"
                  type="search"
                  value={query}
                />
              </label>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div>
                  <p className="eyebrow">Materials</p>
                  <h2>文件列表</h2>
                </div>
                <ZjuStatusPill tone="muted">{filteredMaterials.length} / {materials.length}</ZjuStatusPill>
              </div>
              <div className="zju-material-list">
                {filteredMaterials.length === 0 ? <p className="tool-empty">{loading === "materials" ? "正在读取资料..." : "当前筛选下没有资料。"}</p> : null}
                {filteredMaterials.map((material) => {
                  const id = String(material.id);
                  const checked = selectedMaterials.has(id);
                  return (
                    <label className="zju-material-row" key={id}>
                      <input checked={checked} onChange={(event) => toggleMaterial(id, event.target.checked)} type="checkbox" />
                      <div>
                        <strong>{material.name}</strong>
                        <span>{material.activityTitle}</span>
                        <span>{formatSize(material.size)} · {material.createdAt ? formatFullDateTime(material.createdAt) : "无创建时间"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div>
                  <p className="eyebrow">Jobs</p>
                  <h2>下载任务</h2>
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无任务。</p> : null}
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
          </div>
        </div>
      </ZjuToolShell>
    </ZjuAuthGate>
  );
}
