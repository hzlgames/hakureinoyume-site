"use client";
import { useEffect, useState } from "react";
import { DashboardCard } from "../../../_components/ui";
import { fetchJson, formatFullDateTime, ZjuAuthGate, ZjuToolShell, ZjuErrorMessage, ZjuMetricCard } from "../courses.zju/_components";

type Score = Record<string, string>;
type Settings = { enabled: boolean; startHour: number; endHour: number; intervalSeconds: number; notifyInitial: boolean; checkEvaluation: boolean; notifications: boolean; hasWebhook?: boolean; hasSigningSecret?: boolean };
type Overview = { settings: Settings; state: { scores?: Record<string, Score>; metrics?: { gpa: number; percentAverage: number; totalCredits: number }; history?: { key: string; current: Score; previous: Score | null; at: string }[]; lastSync?: string; error?: string; evaluationDone?: boolean | null } };
const defaults: Settings = { enabled: false, startHour: 8, endHour: 24, intervalSeconds: 3600, notifyInitial: false, checkEvaluation: true, notifications: false };
export default function GradesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [webhook, setWebhook] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [clearWebhook, setClearWebhook] = useState(false);
  const [clearSigningSecret, setClearSigningSecret] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetchJson<Overview>("/api/zju/grades").then((value) => { if (!cancelled) { setData(value); setSettings(value.settings); } }).catch((e) => { if (!cancelled) setError(e.message); });
    const timer = setInterval(() => void fetchJson<Overview>("/api/zju/grades").then((value) => { if (!cancelled) setData(value); }).catch(() => undefined), 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  async function act(action: "save" | "check" | "test-ding") {
    setBusy(action); setError(""); setNotice("");
    try {
      if (action === "save") {
        const next = await fetchJson<Overview>("/api/zju/grades", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...settings, webhook, signingSecret, clearWebhook, clearSigningSecret }) });
        setData(next); setSettings(next.settings); setWebhook(""); setSigningSecret(""); setClearWebhook(false); setClearSigningSecret(false); setNotice("监控设置已保存。");
      } else {
        await fetchJson("/api/zju/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        setData(await fetchJson<Overview>("/api/zju/grades")); setNotice(action === "check" ? "成绩检查完成。" : "测试通知已发送。");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败。"); } finally { setBusy(""); }
  }
  const metrics = data?.state.metrics;
  return <ZjuAuthGate callback="/tools/ZJU_tools/zdbk.zju"><ZjuToolShell title="正式成绩与监控" eyebrow="本科教学管理" backHref="/tools/ZJU_tools" backLabel="ZJU 工具箱" lead="查询正式课程成绩、记录成绩变化，并按设定时段定期检查。关闭网页后监控仍会继续。">
    <ZjuErrorMessage message={error || data?.state.error || ""} />{notice ? <p className="auth-message success">{notice}</p> : null}
    <div className="zju-metric-grid"><ZjuMetricCard label="加权绩点" value={metrics?.gpa.toFixed(2) ?? "—"} /><ZjuMetricCard label="百分制加权平均" value={metrics?.percentAverage.toFixed(2) ?? "—"} /><ZjuMetricCard label="计入绩点学分" value={metrics?.totalCredits.toFixed(1) ?? "—"} /></div>
    <DashboardCard className="tool-detail-card"><h2>监控设置</h2>
      <form className="tool-form" onSubmit={(event) => { event.preventDefault(); void act("save"); }}>
        <label className="tool-checkbox-label"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />启用后台监控</label>
        <div className="zju-metric-grid">{([ ["startHour", "开始时间（北京时间，小时）", 0, 23], ["endHour", "结束时间（北京时间，小时）", 1, 24], ["intervalSeconds", "检查间隔（秒）", 60, 86400] ] as const).map(([key, label, min, max]) => <label key={key}><span>{label}</span><input type="number" min={min} max={max} required value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} /></label>)}</div>
        <label className="tool-checkbox-label"><input type="checkbox" checked={settings.notifyInitial} onChange={(e) => setSettings({ ...settings, notifyInitial: e.target.checked })} />首次检查也通知历史成绩</label>
        <label className="tool-checkbox-label"><input type="checkbox" checked={settings.checkEvaluation} onChange={(e) => setSettings({ ...settings, checkEvaluation: e.target.checked })} />检查本学期评教完成状态</label>
        <label className="tool-checkbox-label"><input type="checkbox" checked={settings.notifications} onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })} />成绩变化时发送钉钉通知</label>
        <label><span>钉钉 Webhook（{settings.hasWebhook ? "已保存，留空沿用" : "可选"}）</span><input type="password" autoComplete="off" value={webhook} onChange={(e) => setWebhook(e.target.value)} /></label>
        <label><span>钉钉加签密钥（{settings.hasSigningSecret ? "已保存，留空沿用" : "可选"}）</span><input type="password" autoComplete="off" value={signingSecret} onChange={(e) => setSigningSecret(e.target.value)} /></label>
        {settings.hasWebhook ? <label className="tool-checkbox-label"><input type="checkbox" checked={clearWebhook} onChange={(e) => setClearWebhook(e.target.checked)} />清除钉钉配置并关闭通知</label> : null}
        {settings.hasSigningSecret ? <label className="tool-checkbox-label"><input type="checkbox" checked={clearSigningSecret} onChange={(e) => setClearSigningSecret(e.target.checked)} />清除加签密钥</label> : null}
        <div className="tool-action-row"><button className="button primary-button" disabled={!!busy} type="submit">{busy === "save" ? "保存中" : "保存设置"}</button><button className="button secondary-button" disabled={!!busy} type="button" onClick={() => void act("check")}>{busy === "check" ? "检查中" : "立即检查"}</button><button className="button secondary-button" disabled={!!busy || !data?.settings.notifications} type="button" onClick={() => void act("test-ding")}>发送钉钉测试通知</button></div>
      </form>
      <p className="tool-account-meta">立即检查使用已保存的设置。默认首次只建立基线，不发送历史成绩；通知失败会在后续检查重试。</p>
    </DashboardCard>
    <DashboardCard className="tool-detail-card"><h2>正式成绩</h2><p className="tool-account-meta">上次同步：{data?.state.lastSync ? formatFullDateTime(data.state.lastSync) : "尚未检查"}</p>{data?.state.evaluationDone === false ? <p className="auth-message">本学期尚未完成评教，可能无法查询最新成绩。</p> : null}
      <div className="zju-table-scroll"><table className="zju-grade-table"><thead><tr><th>课程</th><th>成绩</th><th>补考</th><th>绩点</th><th>学分</th></tr></thead><tbody>{Object.entries(data?.state.scores ?? {}).map(([key, score]) => <tr key={key}><td>{score.kcmc}<small>{score.xkkh}</small></td><td>{score.cj || "—"}</td><td>{score.bkcj || "—"}</td><td>{score.jd || "—"}</td><td>{score.xf || "—"}</td></tr>)}</tbody></table></div>
      {!Object.keys(data?.state.scores ?? {}).length ? <p className="tool-empty">暂无成绩记录，请点击立即检查。</p> : null}
    </DashboardCard>
    <DashboardCard className="tool-detail-card"><h2>成绩变化</h2>{(data?.state.history ?? []).map((change, index) => <div className="zju-job" key={`${change.at}-${change.key}-${index}`}><strong>{change.current.kcmc}</strong><p>{change.previous?.cj || "无"} → {change.current.cj || "—"} · 绩点 {change.current.jd || "—"} · 学分 {change.current.xf || "—"}</p><small>{formatFullDateTime(change.at)}</small></div>)}{!data?.state.history?.length ? <p className="tool-empty">暂无变化记录。</p> : null}</DashboardCard>
  </ZjuToolShell></ZjuAuthGate>;
}
