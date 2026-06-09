"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { AuthShell } from "../_components/auth/auth-shell";
import { signUp } from "../../lib/auth-client";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    setError("");

    const result = await signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      callbackURL: "/"
    });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message || "注册失败，请稍后重试。");
      return;
    }

    setPassword("");
    setNotice("账号已创建。请查看邮箱并完成验证后再登录。");
  }

  return (
    <AuthShell eyebrow="Register" title="创建账号" subtitle="注册后需要完成邮箱验证">
      <form className="auth-card" onSubmit={handleRegister}>
        <label>
          <span>昵称</span>
          <input
            autoComplete="name"
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
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
            autoComplete="new-password"
            maxLength={128}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className="button primary-button auth-submit" disabled={submitting} type="submit">
          <UserPlus size={18} />
          {submitting ? "创建中" : "创建账号"}
        </button>
        <div className="auth-inline-actions">
          <Link href="/login">已有账号，去登录</Link>
        </div>
        {error ? <p className="auth-message error">{error}</p> : null}
        {notice ? <p className="auth-message success">{notice}</p> : null}
      </form>
    </AuthShell>
  );
}
