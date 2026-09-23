"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, X } from "lucide-react";
import { TOTP } from "otpauth";
import { DashboardCard, ProgressBar } from "../../_components/ui";
import { parseImport } from "../../../lib/two-factor/core";
import styles from "./two-factor.module.css";

export function TemporaryOtp() {
  const [input, setInput] = useState("");
  const [visible, setVisible] = useState(false);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState("");
  const parsed = useMemo(() => {
    if (!input.trim()) return { otp: null, error: "" };
    try {
      if (input.trim().startsWith("otpauth-migration:")) return { otp: null, error: "临时查看支持单个密钥或 otpauth://totp 链接。" };
      const { entries } = parseImport(input, "临时验证码");
      return { otp: new TOTP(entries[0]), error: "" };
    } catch (error) {
      return { otp: null, error: error instanceof Error ? error.message : "密钥格式无效。" };
    }
  }, [input]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    // Clear before a browser back/forward-cache snapshot can retain the secret.
    const clear = () => { setInput(""); setNotice(""); setVisible(false); };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", clear);
    return () => { window.clearInterval(timer); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", clear); };
  }, []);

  async function copy() {
    if (!parsed.otp) return;
    try { await navigator.clipboard.writeText(parsed.otp.generate({ timestamp: Date.now() })); setNotice("验证码已复制。"); }
    catch { setNotice("复制失败，请手动选择验证码复制。"); }
  }
  function clear() { setInput(""); setNotice(""); setVisible(false); }
  const code = parsed.otp && now ? parsed.otp.generate({ timestamp: now }) : "";
  const remaining = parsed.otp ? parsed.otp.period - Math.floor(now / 1000) % parsed.otp.period : 0;

  return <section aria-label="临时验证码">
    <DashboardCard className={styles.temporaryPanel}>
      <div className={styles.cardHeading}><h2>临时验证码</h2><span className="tool-status-pill muted">无需登录 · 不保存</span></div>
      <p className={styles.help}>粘贴密钥即可查看。仅在当前浏览器内存中计算，不上传、不保存；刷新或离开页面后清除。</p>
      <div className={styles.importGrid}>
        <div className="tool-form">
          <label><span>临时密钥</span><div className="tool-password-input">
            <input type={visible ? "text" : "password"} value={input} onChange={event => { setInput(event.target.value); setNotice(""); }} autoComplete="off" spellCheck={false} maxLength={4096} placeholder="粘贴 Base32 密钥或 otpauth://totp 链接" aria-describedby="temporary-otp-error" />
            <button type="button" className="tool-password-toggle" aria-label={visible ? "隐藏临时密钥" : "显示临时密钥"} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div></label>
          <div><button type="button" className="button secondary-button" onClick={clear} disabled={!input}><X size={17} />清空临时密钥</button></div>
          {parsed.error ? <p id="temporary-otp-error" className="auth-message error" role="alert">{parsed.error}</p> : null}
        </div>
        <div className={styles.temporaryResult}>
          {code && parsed.otp ? <>
            <button type="button" className={styles.code} aria-label="复制临时验证码" title="复制验证码" onClick={() => void copy()}><span>{code.slice(0, code.length / 2)} {code.slice(code.length / 2)}</span><Copy size={19} /></button>
            <div className={styles.countdown}><span>{remaining} 秒后更新</span><span>{parsed.otp.digits} 位 · {parsed.otp.algorithm}</span></div>
            <ProgressBar value={remaining / parsed.otp.period * 100} />
          </> : <p className={styles.help}>输入有效密钥后，验证码会在这里自动更新。</p>}
          <p className={styles.help}>按设备时间生成，请保持系统时间准确。</p>
          {notice ? <p role="status" className="auth-message">{notice}</p> : null}
        </div>
      </div>
    </DashboardCard>
  </section>;
}
