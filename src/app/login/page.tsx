"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { AuthShell } from "../_components/auth/auth-shell";
import { authClient, signIn } from "../../lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const callback = searchParams.get("callback") || "/";

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    const result = await signIn.email({
      email: email.trim().toLowerCase(),
      password,
      rememberMe: true
    });

    setSubmitting(false);

    if (result.error) {
      if (result.error.status === 403) {
        setError("邮箱尚未验证。请先查看邮箱，或重新发送验证邮件。");
        return;
      }

      setError(result.error.message || "登录失败，请检查邮箱和密码。");
      return;
    }

    router.push(callback);
    router.refresh();
  }

  async function resendVerification() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("请先输入邮箱。");
      return;
    }

    setError("");
    setNotice("");

    const result = await authClient.sendVerificationEmail({
      email: normalizedEmail,
      callbackURL: callback
    });

    if (result.error) {
      setError(result.error.message || "验证邮件发送失败。");
      return;
    }

    setNotice("验证邮件已发送，请查收邮箱。");
  }

  return (
    <AuthShell eyebrow="Access" title="登录账号" subtitle="使用已验证邮箱进入博麗の夢">
      <form className="auth-card" onSubmit={handleLogin}>
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
        <label>
          <span>密码</span>
          <input
            autoComplete="current-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="button primary-button auth-submit" disabled={submitting} type="submit">
          <ShieldCheck size={18} />
          {submitting ? "登录中" : "登录"}
        </button>
        <div className="auth-inline-actions">
          <Link href="/register">创建账号</Link>
          <Link href="/forgot-password">忘记密码</Link>
          <button onClick={resendVerification} type="button">
            <Mail size={14} />
            重发验证
          </button>
        </div>
        {error ? <p className="auth-message error">{error}</p> : null}
        {notice ? <p className="auth-message success">{notice}</p> : null}
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
