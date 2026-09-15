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
  ZjuDownloads,
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

  async function startDownload(incremental = false) {
    if (!selectedCourseId || (!incremental && selectedMaterials.size === 0)) return;
    setLoading("download");
    setError("");
    try {
      await fetchJson<{ job?: Job }>("/api/zju/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          tool: incremental ? "courses.zju/materialMaintainer" : "courses.zju/materialDown",
          courseId: selectedCourseId,
          selectedIds: incremental ? [] : [...selectedMaterials]
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

  async function resetCache() {
    if (!selectedCourseId || !window.confirm("重置该课程的增量记录？下次增量下载将重新获取全部资料。")) return;
    try { await fetchJson(`/api/zju/courses/${selectedCourseId}/cache`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cache: [] }) }); }
    catch (error) { setError(error instanceof Error ? error.message : "初始化失败。"); }
  }
  async function importCache(file: File | undefined) {
    if (!file || !selectedCourseId) return;
    try {
      const config = JSON.parse(await file.text());
      if (String(config.xid) !== selectedCourseId) throw new Error("配置中的课程 ID 与当前课程不一致。");
      await fetchJson(`/api/zju/courses/${selectedCourseId}/cache`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config) });
    } catch (error) { setError(error instanceof Error ? error.message : "配置导入失败。"); }
  }
  async function exportCache() {
    try {
      const config = await fetchJson(`/api/zju/courses/${selectedCourseId}/cache`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = ".cache.json"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setError(error instanceof Error ? error.message : "导出失败。"); }
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
            onClick={() => void startDownload()}
            type="button"
          >
            <Download size={18} />
            {loading === "download" ? "创建中" : "下载选中"}
          </button>
        )}
        lead="按课程浏览资料，筛选文件后创建下载任务；超过 5 个文件自动打包，文件最多保留两天，请尽快下载。"
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
              <p className="tool-account-meta">增量下载按上游缓存记录跳过已下载的资料；文件过期后如需重取，可选中下载或重置记录。</p>
              <div className="tool-action-row">
                <button className="button secondary-button" disabled={!selectedCourseId || !!loading} onClick={() => void startDownload(true)}>增量下载</button>
                <button className="button secondary-button" disabled={!selectedCourseId || !!loading} onClick={() => void resetCache()}>初始化 / 重置记录</button>
                <button className="button secondary-button" disabled={!selectedCourseId} onClick={() => void exportCache()}>导出配置</button>
                <label className="tool-form">导入上游 .cache.json<input aria-label="导入上游缓存配置" type="file" accept=".json" disabled={!selectedCourseId} onChange={(event) => void importCache(event.target.files?.[0])} /></label>
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
                <div className="card-title">
                  <FileDown size={18} />
                  文件列表
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
                <div className="card-title">
                  <Download size={18} />
                  下载任务
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无任务。</p> : null}
                {jobs.map((job) => {
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
                      <ZjuDownloads job={job} />
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
