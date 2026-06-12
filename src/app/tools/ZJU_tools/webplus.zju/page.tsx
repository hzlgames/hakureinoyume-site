"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Download, FileText, Link2, RefreshCcw, XCircle } from "lucide-react";
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
  ZjuStatusPill,
  ZjuToolShell
} from "../courses.zju/_components";

export default function ZjuWebplusPage() {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      const payload = await fetchJson<{ jobs?: Job[] }>("/api/zju/jobs");
      setJobs((payload.jobs ?? []).filter((job) => job.tool === "webplus.zju/archive"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务读取失败。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadJobs(), 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "running"].includes(job.status))) return;
    const timer = window.setInterval(() => void loadJobs().catch(() => undefined), 1800);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  async function startArchive() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      await fetchJson<{ job?: Job }>("/api/zju/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "webplus.zju/archive", url: trimmed })
      });
      setUrl("");
      await loadJobs();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "存档任务创建失败。");
    } finally {
      setLoading(false);
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
    <ZjuAuthGate callback="/tools/ZJU_tools/webplus.zju">
      <ZjuToolShell
        backHref="/tools/ZJU_tools"
        backLabel="ZJU 工具"
        eyebrow="WebPlus"
        lead="保存 WebPlus 通知页面及其全部附件，自动还原被命名为 UUID 的附件原始文件名。"
        title="通知存档"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-detail-layout zju-webplus-layout">
          <div className="zju-side-stack">
            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Link2 size={18} />
                  通知链接
                </div>
              </div>
              <p className="tool-account-meta">
                支持 office.ckc.zju.edu.cn、cspo.zju.edu.cn 等基于 WebPlus 的站点。粘贴通知详情页链接即可。
              </p>
              <div className="tool-form">
                <label>
                  <span>通知 URL</span>
                  <input
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void startArchive();
                    }}
                    placeholder="https://.../detail.htm?..."
                    type="url"
                    value={url}
                  />
                </label>
                <div className="tool-action-row">
                  <button className="button primary-button" disabled={loading || !url.trim()} onClick={startArchive} type="button">
                    <Archive size={18} />
                    {loading ? "创建中" : "开始存档"}
                  </button>
                </div>
              </div>
            </DashboardCard>
          </div>

          <div className="zju-detail-main">
            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Archive size={18} />
                  存档任务
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无存档任务。</p> : null}
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
                              {file.name.endsWith(".html") ? <FileText size={14} /> : <Download size={14} />}
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
