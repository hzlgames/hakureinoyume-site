"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { Send } from "lucide-react";
import { AuthShell } from "../_components/auth/auth-shell";
import { authClient } from "../../lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    setError("");

    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/reset-password"
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message || "重置邮件发送失败。");
      return;
    }

    setNotice("如果该邮箱存在账号，重置链接会发送到对应邮箱。");
  }

  return (
    <AuthShell eyebrow="Recovery" title="找回密码" subtitle="通过邮箱链接设置新密码">
      <form className="auth-card" onSubmit={handleSubmit}>
        <label>
          <span>邮箱</span>
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>
        <button className="button primary-button auth-submit" disabled={submitting} type="submit">
          <Send size={18} />
          {submitting ? "发送中" : "发送重置邮件"}
        </button>
        <div className="auth-inline-actions">
          <Link href="/login">返回登录</Link>
        </div>
        {error ? <p className="auth-message error">{error}</p> : null}
        {notice ? <p className="auth-message success">{notice}</p> : null}
      </form>
    </AuthShell>
  );
}
