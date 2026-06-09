"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { KeyRound } from "lucide-react";
import { AuthShell } from "../_components/auth/auth-shell";
import { authClient } from "../../lib/auth-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(linkError ? "重置链接无效或已过期。" : "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setError("缺少重置 token，请重新申请密码重置。");
      return;
    }

    setSubmitting(true);
    setNotice("");
    setError("");

    const result = await authClient.resetPassword({
      newPassword: password,
      token
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message || "密码重置失败。");
      return;
    }

    setPassword("");
    setNotice("密码已更新，可以使用新密码登录。");
  }

  return (
    <AuthShell eyebrow="Reset" title="设置新密码" subtitle="重置后其他会话会被撤销">
      <form className="auth-card" onSubmit={handleSubmit}>
        <label>
          <span>新密码</span>
          <input
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="button primary-button auth-submit" disabled={submitting || !token} type="submit">
          <KeyRound size={18} />
          {submitting ? "更新中" : "更新密码"}
        </button>
        <div className="auth-inline-actions">
          <Link href="/login">返回登录</Link>
          <Link href="/forgot-password">重新申请</Link>
        </div>
        {error ? <p className="auth-message error">{error}</p> : null}
        {notice ? <p className="auth-message success">{notice}</p> : null}
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
