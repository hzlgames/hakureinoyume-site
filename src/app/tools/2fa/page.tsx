"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { TOTP } from "otpauth";
import { DashboardCard, ProgressBar } from "../../_components/ui";
import { useSession } from "../../../lib/auth-client";
import { assembleParts, parseImport, type ImportPart, type SavedOtpEntry } from "../../../lib/two-factor/core";
import styles from "./two-factor.module.css";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "请求失败，请重试。");
  return payload;
}

function CameraScanner({ onResult, onError }: { onResult: (value: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => {
    let cancelled = false;
    let scanner: import("qr-scanner").default | undefined;
    async function start() {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (cancelled || !video.current) return;
        let last = "";
        scanner = new QrScanner(video.current, result => {
          if (result.data === last) return;
          last = result.data;
          onResultRef.current(result.data);
        }, { preferredCamera: "environment", highlightScanRegion: true, returnDetailedScanResult: true });
        await scanner.start();
        if (cancelled) scanner.destroy();
      } catch {
        if (!cancelled) onError("无法打开摄像头。请在 HTTPS 或 localhost 下允许摄像头权限，也可上传二维码图片。");
      }
    }
    void start();
    return () => { cancelled = true; scanner?.destroy(); };
  }, [onError]);
  return <video ref={video} className={styles.camera} muted playsInline aria-label="二维码扫描画面" />;
}

function OtpCard({ entry, now, onDelete, busy, onNotice }: { entry: SavedOtpEntry; now: number; onDelete: (entry: SavedOtpEntry) => void; busy: boolean; onNotice: (message: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const otp = useMemo(() => new TOTP(entry), [entry]);
  const code = otp.generate({ timestamp: now });
  const remaining = entry.period - Math.floor(now / 1000) % entry.period;
  async function copy(value: string, kind: string) {
    try { await navigator.clipboard.writeText(value); onNotice(`${kind}已复制。`); }
    catch { onNotice("复制失败，请手动选择并复制。"); }
  }
  return <DashboardCard className={styles.account}>
    <div className={styles.cardHeading}>
      <div className={styles.accountName}><p className="eyebrow">{entry.issuer || "Authenticator"}</p><h2>{entry.label}</h2></div>
      <button type="button" className={styles.iconButton} title="删除账号" aria-label={`删除 ${entry.label}`} disabled={busy} onClick={() => onDelete(entry)}><Trash2 size={18} /></button>
    </div>
    <button type="button" className={styles.code} title="复制验证码" aria-label={`复制 ${entry.label} 的验证码 ${code}`} onClick={() => void copy(otp.generate({ timestamp: now }), "验证码")}>
      <span>{code.slice(0, code.length / 2)} {code.slice(code.length / 2)}</span><Copy size={19} />
    </button>
    <div className={styles.countdown}><span>{remaining} 秒后更新</span><span>{entry.digits} 位 · {entry.algorithm}</span></div>
    <ProgressBar value={remaining / entry.period * 100} />
    <button type="button" className={styles.reveal} aria-expanded={revealed} onClick={() => setRevealed(v => !v)}>{revealed ? <EyeOff size={15} /> : <Eye size={15} />}{revealed ? "隐藏密钥" : "查看密钥"}</button>
    {revealed ? <div className={styles.secret}><code>{entry.secret}</code><button type="button" className={styles.iconButton} aria-label={`复制 ${entry.label} 的密钥`} onClick={() => void copy(entry.secret, "密钥")}><Copy size={16} /></button></div> : null}
  </DashboardCard>;
}

function Vault() {
  const [entries, setEntries] = useState<SavedOtpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [issuer, setIssuer] = useState("");
  const [parts, setParts] = useState<ImportPart[]>([]);
  const [camera, setCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<SavedOtpEntry | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const preview = useMemo(() => assembleParts(parts), [parts]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const payload = await api<{ entries: SavedOtpEntry[]; serverTime: number }>("/api/two-factor");
      if (!mounted.current || version !== requestVersion.current) return;
      offset.current = payload.serverTime - Date.now();
      setNow(Date.now() + offset.current);
      setEntries(payload.entries); setAvailable(true); setError("");
    } catch (e) {
      if (!mounted.current || version !== requestVersion.current) return;
      setEntries([]); setAvailable(false); setParts([]); setText(""); setCamera(false); setDeleting(null);
      setError(e instanceof Error ? e.message : "读取失败，请重试。");
    } finally { if (mounted.current && version === requestVersion.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    const sync = window.setInterval(() => void refresh(), 60_000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; window.clearTimeout(initial); window.clearInterval(timer); window.clearInterval(sync); window.removeEventListener("focus", focus); };
  }, [refresh]);

  const addScan = useCallback((value: string) => {
    try {
      const part = parseImport(value);
      if (part.batch && parts.some(p => p.batch?.id === part.batch!.id && p.batch?.index === part.batch!.index)) return;
      const next = [...parts, part];
      const assembled = assembleParts(next);
      if (assembled.entries.length === assembleParts(parts).entries.length && !part.batch) return;
      setParts(next);
      setNotice("已识别二维码，请核对下方待导入账号。多张导出码请继续扫描。"); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "二维码解析失败。"); }
  }, [parts]);
  const cameraError = useCallback((message: string) => { setError(message); setCamera(false); }, []);

  function addText(event: FormEvent) {
    event.preventDefault();
    try {
      const part = parseImport(text, label, issuer);
      const next = [...parts, part];
      assembleParts(next); setParts(next); setText(""); setLabel(""); setIssuer(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "无法识别输入内容。"); }
  }
  async function scanFiles(files: FileList | null) {
    if (!files?.length) return;
    setScanning(true); setError("");
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const next: ImportPart[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10_000_000) throw new Error("单张图片不能超过 10 MB。");
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        next.push(parseImport(result.data));
      }
      const combined = [...parts, ...next];
      assembleParts(combined); setParts(combined); setNotice(`已识别 ${files.length} 张二维码图片，请核对待导入账号。`);
    } catch (e) { setError(e instanceof Error ? e.message : "无法识别二维码，请上传清晰、完整的二维码图片。"); }
    finally { setScanning(false); if (upload.current) upload.current.value = ""; }
  }
  async function save() {
    if (!preview.entries.length || preview.missing || busy) return;
    setBusy(true); setError(""); setCamera(false);
    try {
      const result = await api<{ added: number; skipped: number }>("/api/two-factor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: preview.entries }) });
      setParts([]); setImporting(false); setText(""); setNotice(`已保存 ${result.added} 个账号${result.skipped ? `，跳过 ${result.skipped} 个重复账号` : ""}。`);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError("");
    try {
      await api(`/api/two-factor/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      requestVersion.current++;
      setEntries(current => current.filter(entry => entry.id !== deleting.id)); setDeleting(null); setNotice("账号已删除。");
    } catch (e) { setError(e instanceof Error ? e.message : "删除失败，请重试。"); }
    finally { setBusy(false); }
  }
  const filtered = entries.filter(e => `${e.issuer} ${e.label}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className={styles.toolbar}>
      <label className={`tool-form ${styles.search}`}><span className={styles.srOnly}>搜索账号或服务商</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索账号或服务商…" type="search" /></label>
      <div className="tool-action-row"><button className="button secondary-button" onClick={() => void refresh()} disabled={busy || loading} aria-label="刷新账号"><RefreshCw size={17} /></button><button className="button primary-button" disabled={!available || busy} onClick={() => { setImporting(v => !v); setCamera(false); }}><Plus size={18} />导入账号</button></div>
    </div>
    {error ? <p className="auth-message error" role="alert">{error}</p> : null}
    {notice ? <p className="auth-message success" role="status">{notice}</p> : null}
    {importing && available ? <DashboardCard className={styles.importPanel}>
      <div className={styles.cardHeading}><h2>导入验证器账号</h2><button className={styles.iconButton} aria-label="关闭导入" disabled={busy || scanning} onClick={() => { setImporting(false); setCamera(false); setParts([]); setText(""); }}><X size={20} /></button></div>
      <p className={styles.help}>在 Google Authenticator 中选择「转移账号 → 导出账号」，扫描全部二维码；也可上传二维码截图，或粘贴设置 2FA 时提供的长密钥。</p>
      <div className={styles.importGrid}>
        <form className="tool-form" onSubmit={addText}>
          <label><span>密钥或导入链接</span><textarea value={text} onChange={e => setText(e.target.value)} autoComplete="off" spellCheck={false} maxLength={100_000} required placeholder="Base32 密钥 / otpauth://… / otpauth-migration://…" /></label>
          <div className={styles.fields}><label><span>账号名称（手动密钥必填）</span><input value={label} onChange={e => setLabel(e.target.value)} maxLength={160} placeholder="例如 name@example.com" autoComplete="off" /></label><label><span>服务商（可选）</span><input value={issuer} onChange={e => setIssuer(e.target.value)} maxLength={160} placeholder="例如 Google / GitHub" autoComplete="off" /></label></div>
          <button className="button secondary-button" type="submit" disabled={busy || scanning || !text.trim()}>添加到待导入列表</button>
        </form>
        <div className={styles.scanPanel}><div className="tool-action-row"><button className="button secondary-button" disabled={busy || scanning} onClick={() => setCamera(v => !v)}><Camera size={18} />{camera ? "关闭摄像头" : "摄像头扫码"}</button><button className="button secondary-button" disabled={busy || scanning || camera} onClick={() => upload.current?.click()}><Upload size={18} />{scanning ? "识别中…" : "上传二维码"}</button></div>
          <input ref={upload} type="file" accept="image/*" multiple hidden aria-label="上传二维码图片" onChange={e => void scanFiles(e.target.files)} />
          {camera ? <CameraScanner onResult={addScan} onError={cameraError} /> : <p className={styles.help}>支持普通 2FA 二维码和 Google Authenticator 批量导出码。图片在浏览器内识别，不上传图片。</p>}
        </div>
      </div>
      {preview.entries.length ? <div className={styles.preview}>
        <div className={styles.cardHeading}><h3>待导入 {preview.entries.length} 个账号</h3><button className="button secondary-button" disabled={busy || scanning} onClick={() => { setParts([]); setCamera(false); }}>清空列表</button></div>
        <ul>{preview.entries.map((entry, index) => <li key={index}><strong>{entry.issuer || "未指定服务商"}</strong><span>{entry.label}</span><small>{entry.digits} 位 · {entry.period} 秒</small></li>)}</ul>
        {preview.missing ? <p className={styles.help} role="status">当前批次还缺 {preview.missing} 张二维码，请继续扫描后保存。</p> : null}
        <button className="button primary-button" disabled={busy || scanning || preview.missing > 0} onClick={() => void save()}><ShieldCheck size={18} />{busy ? "保存中…" : `确认保存 ${preview.entries.length} 个账号`}</button>
      </div> : null}
    </DashboardCard> : null}
    {deleting ? <DashboardCard className={styles.deletePanel}><h2>删除「{deleting.issuer ? `${deleting.issuer} · ` : ""}{deleting.label}」？</h2><p>本站保存的密钥会被删除。请确认其他验证器或恢复码仍可用；此操作不会关闭原网站的两步验证。</p><div className="tool-action-row"><button className="button secondary-button" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="button primary-button" disabled={busy} onClick={() => void remove()}>{busy ? "删除中…" : "确认删除"}</button></div></DashboardCard> : null}
    {loading ? <DashboardCard>正在读取验证器…</DashboardCard> : available ? <>
      <p className={styles.summary}>共 {entries.length} 个账号 · 验证码自动更新，点击即可复制</p>
      {entries.length ? filtered.length ? <div className={styles.accounts}>{filtered.map(entry => <OtpCard key={entry.id} entry={entry} now={now} busy={busy} onDelete={setDeleting} onNotice={setNotice} />)}</div> : <DashboardCard>没有匹配的账号，试试其他关键词。</DashboardCard> : <DashboardCard className={styles.empty}><ShieldCheck size={36} /><h2>把常用验证码放在一起</h2><p>导入第一个账号，随时查看验证码和剩余时间。</p><button className="button primary-button" onClick={() => setImporting(true)}><Plus size={18} />导入第一个账号</button></DashboardCard>}
    </> : null}
  </>;
}

export default function TwoFactorPage() {
  const { data: session, isPending } = useSession();
  return <section className={`page-shell tools-page ${styles.page}`}>
    <Link className={styles.back} href="/tools"><ArrowLeft size={16} />返回工具箱</Link>
    <div className="intro tools-intro"><p className="eyebrow">Authenticator</p><h1>2FA 验证器</h1><p className="lead">所有账号的动态验证码，一处查看。兼容 Google Authenticator，密钥按本站账号隔离并加密保存。</p></div>
    {isPending ? <DashboardCard>加载中…</DashboardCard> : session?.user ? <Vault key={session.user.id} /> : <DashboardCard className="tool-detail-card"><h2>请先登录</h2><p className="lead">登录本站账号后，即可保存和管理你的 2FA 账号。</p><Link className="button primary-button tool-inline-button" href="/login?callback=/tools/2fa"><KeyRound size={18} />登录</Link></DashboardCard>}
  </section>;
}
