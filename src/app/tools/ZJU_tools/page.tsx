"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, FileDown, KeyRound, ListChecks, Save, Trash2 } from "lucide-react";
import { DashboardCard } from "../../_components/ui";
import { useSession } from "../../../lib/auth-client";

type AccountPayload = {
  account: {
    hasPintiaCookie: boolean;
    lastValidatedAt: string | null;
    updatedAt: string;
    username: string;
  } | null;
};

const zjuTools = [
  {
    href: "/tools/ZJU_tools/courses.zju/todos",
    icon: <ListChecks size={24} />,
    title: "待办中心",
    text: "查看学在浙大与 Pintia 待办。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/scores",
    icon: <BookOpen size={24} />,
    title: "成绩查询",
    text: "按课程查看作业和考试分数。"
  },
  {
    href: "/tools/ZJU_tools/courses.zju/materials",
    icon: <FileDown size={24} />,
    title: "课程资料",
    text: "筛选资料并创建下载任务。"
  }
];

function formatAccountTime(value: string | null) {
  if (!value) return "尚未验证";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function ZjuToolsPage() {
  const { data: session, isPending } = useSession();
  const [account, setAccount] = useState<AccountPayload["account"]>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pintiaCookie, setPintiaCookie] = useState("");
  const [clearPintiaCookie, setClearPintiaCookie] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch("/api/zju/account")
        .then((response) => response.json())
        .then((payload: AccountPayload) => {
          if (cancelled) return;
          setAccount(payload.account);
          setUsername(payload.account?.username ?? "");
        })
        .catch(() => {
          if (!cancelled) setError("读取 ZJU 账号状态失败。");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session?.user]);

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");

    const response = await fetch("/api/zju/account", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        username,
        password,
        ...(pintiaCookie.trim() ? { pintiaCookie } : {}),
        clearPintiaCookie
      })
    });
    const payload = await response.json() as AccountPayload & { message?: string };
    setSaving(false);

    if (!response.ok) {
      setError(payload.message ?? "保存失败。");
      return;
    }

    setAccount(payload.account);
    setPassword("");
    setPintiaCookie("");
    setClearPintiaCookie(false);
    setNotice("ZJU 账号已验证并保存。");
  }

  async function deleteAccount() {
    setNotice("");
    setError("");
    const response = await fetch("/api/zju/account", {
      method: "DELETE"
    });

    if (!response.ok) {
      setError("删除失败。");
      return;
    }

    setAccount(null);
    setUsername("");
    setPassword("");
    setPintiaCookie("");
    setClearPintiaCookie(false);
    setNotice("ZJU 账号已删除。");
  }

  if (isPending || loading) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card">加载中...</DashboardCard>
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card">
          <p className="eyebrow">ZJU</p>
          <h1>请先登录</h1>
          <p className="lead">登录本站账号后，才能保存 ZJU 凭据并使用工具。</p>
          <Link className="button primary-button tool-inline-button" href="/login?callback=/tools/ZJU_tools">
            <KeyRound size={18} />
            登录
          </Link>
        </DashboardCard>
      </section>
    );
  }

  return (
    <section className="page-shell tools-page">
      <div className="intro tools-intro">
        <p className="eyebrow">ZJU</p>
        <h1>ZJU 工具合集</h1>
        <p className="lead">凭据加密保存，工具任务仅使用当前登录用户自己的账号和目录。</p>
      </div>

      <div className="zju-home-grid">
        <DashboardCard className="tool-detail-card">
          <div className="card-header">
            <div className="card-title">
              <KeyRound size={18} />
              ZJU 账号
            </div>
            {account ? <span className="tool-status-pill">已保存</span> : <span className="tool-status-pill muted">未保存</span>}
          </div>
          {account ? (
            <p className="tool-account-meta">
              {account.username} · 上次验证 {formatAccountTime(account.lastValidatedAt)}
              {account.hasPintiaCookie ? " · Pintia 已配置" : ""}
            </p>
          ) : null}
          <form className="tool-form" onSubmit={saveAccount}>
            <label>
              <span>学号</span>
              <input
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                type="text"
                value={username}
              />
            </label>
            <label>
              <span>密码</span>
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={account ? "留空沿用已保存密码" : ""}
                required={!account}
                type="password"
                value={password}
              />
            </label>
            <label>
              <span>Pintia Cookie</span>
              <textarea
                onChange={(event) => {
                  setPintiaCookie(event.target.value);
                  if (event.target.value.trim()) setClearPintiaCookie(false);
                }}
                placeholder={account?.hasPintiaCookie ? "已保存；如需更新请重新粘贴" : "可选，仅用于合并 Pintia 待办"}
                rows={4}
                value={pintiaCookie}
              />
            </label>
            {account?.hasPintiaCookie ? (
              <label className="tool-checkbox-label">
                <input
                  checked={clearPintiaCookie}
                  onChange={(event) => setClearPintiaCookie(event.target.checked)}
                  type="checkbox"
                />
                <span>清除已保存的 Pintia Cookie</span>
              </label>
            ) : null}
            <div className="tool-action-row">
              <button className="button primary-button" disabled={saving || !username.trim() || (!password && !account)} type="submit">
                <Save size={18} />
                {saving ? "验证中" : account ? "更新账号" : "保存账号"}
              </button>
              {account ? (
                <button className="button secondary-button" onClick={deleteAccount} type="button">
                  <Trash2 size={18} />
                  删除
                </button>
              ) : null}
            </div>
            {notice ? <p className="auth-message success">{notice}</p> : null}
            {error ? <p className="auth-message error">{error}</p> : null}
          </form>
        </DashboardCard>

        <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading">
            <div>
              <p className="eyebrow">courses.zju</p>
              <h2>学在浙大</h2>
            </div>
            <Link className="zju-text-link" href="/tools/ZJU_tools/courses.zju">
              工具索引
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="zju-suite-grid">
            {zjuTools.map((tool) => (
              <Link className="zju-suite-tool" href={tool.href} key={tool.href}>
                <span>{tool.icon}</span>
                <strong>{tool.title}</strong>
                <p>{tool.text}</p>
              </Link>
            ))}
          </div>
        </DashboardCard>
      </div>
    </section>
  );
}
