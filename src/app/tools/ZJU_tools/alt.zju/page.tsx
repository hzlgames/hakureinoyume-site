"use client";
import { useEffect, useState } from "react";
import { DashboardCard } from "../../../_components/ui";
import { fetchJson, Job, ZjuAuthGate, ZjuToolShell, ZjuErrorMessage, toolStatusLabel } from "../courses.zju/_components";

type Course = { id: string; courseName: string; teacherList: { userSid: string; userName: string; filled: boolean }[] };
export default function EvaluationPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function load() {
    setBusy(true); setError(""); setConfirmed(false);
    try { const data = await fetchJson<{ courses: Course[] }>("/api/zju/evaluation"); setCourses(data.courses); setSelected(data.courses.flatMap((course) => course.teacherList.filter((t) => !t.filled).map((t) => `${course.id}:${t.userSid}`))); }
    catch (e) { setError(e instanceof Error ? e.message : "读取失败。"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const refresh = () => fetchJson<{ jobs: Job[] }>("/api/zju/jobs").then((data) => setJobs(data.jobs.filter((job) => job.tool === "alt.zju/autojudge"))).catch(() => undefined);
    const timer = setInterval(() => void refresh(), 2500); void refresh();
    return () => clearInterval(timer);
  }, []);
  async function submit() {
    setBusy(true); setError("");
    try {
      const selections = courses.map((course) => ({ courseId: course.id, teacherIds: course.teacherList.filter((t) => selected.includes(`${course.id}:${t.userSid}`)).map((t) => t.userSid) })).filter((course) => course.teacherIds.length);
      const data = await fetchJson<{ job: Job }>("/api/zju/evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed, selections }) });
      setJobs((old) => [data.job, ...old]); setConfirmed(false); setSelected([]);
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败。"); } finally { setBusy(false); }
  }
  return <ZjuAuthGate callback="/tools/ZJU_tools/alt.zju"><ZjuToolShell title="自动评教" eyebrow="教在浙大" backHref="/tools/ZJU_tools" backLabel="ZJU 工具箱" lead="按上游默认内容提交满分（5/5）评价，可一次选择全部课程或逐门选择教师。">
    <ZjuErrorMessage message={error} />
    <DashboardCard className="tool-detail-card">
      <div className="tool-action-row"><button className="button secondary-button" disabled={busy} onClick={() => void load()}>读取待评课程</button><button className="button secondary-button" disabled={busy || !courses.length} onClick={() => { setSelected(courses.flatMap((c) => c.teacherList.map((t) => `${c.id}:${t.userSid}`))); setConfirmed(false); }}>全选教师</button><button className="button secondary-button" disabled={busy} onClick={() => { setSelected([]); setConfirmed(false); }}>清空选择</button></div>
      {!courses.length ? <p className="tool-empty">点击读取待评课程，查看课程和教师后再提交。</p> : null}
      {courses.map((course) => <div className="zju-job" key={course.id}><h2>{course.courseName}</h2>{course.teacherList.map((teacher) => { const key = `${course.id}:${teacher.userSid}`; return <label className="tool-checkbox-label" key={key}><input type="checkbox" checked={selected.includes(key)} disabled={busy} onChange={(e) => { setSelected((old) => e.target.checked ? [...old, key] : old.filter((x) => x !== key)); setConfirmed(false); }} />{teacher.userName}{teacher.filled ? "（已评）" : ""}</label>; })}</div>)}
      <p className="tool-account-meta">已选择 {selected.length} 位教师。提交后将写入校方评教系统。</p>
      <label className="tool-checkbox-label"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我已检查所选教师，确认按上游默认内容提交满分评价。</label>
      <button className="button primary-button" disabled={busy || !confirmed || !selected.length || jobs.some((job) => ["running", "queued"].includes(job.status))} onClick={() => void submit()}>{busy ? "处理中" : "提交所选评价"}</button>
    </DashboardCard>
    <DashboardCard className="tool-detail-card"><h2>评教任务</h2>{jobs.map((job) => <div className="zju-job" key={job.id}><strong>{toolStatusLabel(job.status)}</strong><pre>{job.logs || job.error || "等待执行"}</pre>{job.error ? <p>{job.error}</p> : null}{["running", "queued"].includes(job.status) ? <button className="button secondary-button" onClick={() => void fetchJson(`/api/zju/jobs/${job.id}`, { method: "DELETE" }).catch((e) => setError(e.message))}>取消剩余提交</button> : null}</div>)}</DashboardCard>
  </ZjuToolShell></ZjuAuthGate>;
}
