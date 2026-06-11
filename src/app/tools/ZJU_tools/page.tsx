"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  Archive,
  BookMarked,
  BookOpen,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  GraduationCap,
  KeyRound,
  Library,
  ListChecks,
  MonitorPlay,
  PlayCircle,
  Save,
  Trash2
} from "lucide-react";
import { DashboardCard } from "../../_components/ui";
import { useSession } from "../../../lib/auth-client";

type AccountPayload = {
  account: {
    hasPintiaCookie: boolean;
    isValid: boolean;
    lastValidatedAt: string | null;
    updatedAt: string;
    username: string;
  } | null;
};

const toolCategories = [
  {
    key: "courses",
    eyebrow: "学在浙大",
    name: "课程助手",
    href: "/tools/ZJU_tools/courses.zju",
    icon: <GraduationCap size={20} />,
    tools: [
      { href: "/tools/ZJU_tools/courses.zju/todos", icon: <ListChecks size={22} />, title: "待办中心", text: "汇总学在浙大与 Pintia 待办。" },
      { href: "/tools/ZJU_tools/courses.zju/scores", icon: <BookOpen size={22} />, title: "成绩查询", text: "按课程查看作业与考试分数。" },
      { href: "/tools/ZJU_tools/courses.zju/materials", icon: <FileDown size={22} />, title: "课程资料", text: "筛选资料并创建下载任务。" },
      { href: "/tools/ZJU_tools/courses.zju/autoplay", icon: <PlayCircle size={22} />, title: "自动刷课", text: "拟真倍速自动完成课程活动。" }
    ]
  },
  {
    key: "classroom",
    eyebrow: "智云课堂",
    name: "课堂录播",
    href: "/tools/ZJU_tools/classroom.zju",
    icon: <MonitorPlay size={20} />,
    tools: [
      { href: "/tools/ZJU_tools/classroom.zju", icon: <MonitorPlay size={22} />, title: "回放与转录", text: "复制录播链接，导出 PPT 字幕转录。" }
    ]
  },
  {
    key: "lib",
    eyebrow: "图书馆",
    name: "借阅续借",
    href: "/tools/ZJU_tools/lib.zju",
    icon: <Library size={20} />,
    tools: [
      { href: "/tools/ZJU_tools/lib.zju", icon: <BookMarked size={22} />, title: "借阅续借", text: "查询在借图书与到期，一键续借。" }
    ]
  },
  {
    key: "webplus",
    eyebrow: "WebPlus",
    name: "通知存档",
    href: "/tools/ZJU_tools/webplus.zju",
    icon: <Archive size={20} />,
    tools: [
      { href: "/tools/ZJU_tools/webplus.zju", icon: <FileText size={22} />, title: "通知存档", text: "保存通知页面与全部附件。" }
    ]
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
  const [showPassword, setShowPassword] = useState(false);
  const [pintiaCookie, setPintiaCookie] = useState("");
  const [clearPintiaCookie, setClearPintiaCookie] = useState(false);
  const [isRemovingAccount, setIsRemovingAccount] = useState(false);
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
    setIsRemovingAccount(false);
    const response = await fetch("/api/zju/account", {
      method: "DELETE"
    });

    if (!response.ok) {
      setError("删除失败。");
      return;
    }

    setIsRemovingAccount(true);
    window.setTimeout(() => {
      setAccount(null);
      setUsername("");
      setPassword("");
      setPintiaCookie("");
      setClearPintiaCookie(false);
      setIsRemovingAccount(false);
      setNotice("ZJU 账号已删除。");
    }, 360);
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

  const hasValidAccount = Boolean(account?.isValid);
  const showToolsCard = hasValidAccount || isRemovingAccount;
  const gridStateClass = showToolsCard
    ? isRemovingAccount
      ? "zju-home-grid-ready zju-home-grid-removing"
      : "zju-home-grid-ready"
    : "zju-home-grid-auth-only";

  return (
    <section className="page-shell tools-page">
      <div className="intro tools-intro">
        <p className="eyebrow">ZJU</p>
        <h1>ZJU 工具合集</h1>
        <p className="lead">凭据加密保存，工具任务仅使用当前登录用户自己的账号和目录。</p>
      </div>

      <div className={`zju-home-grid ${gridStateClass}`}>
        <DashboardCard className="tool-detail-card zju-account-card">
          <div className="card-header">
            <div className="card-title">
              <KeyRound size={18} />
              ZJU 账号
            </div>
            {hasValidAccount ? (
              <span className="tool-status-pill">已验证</span>
            ) : account ? (
              <span className="tool-status-pill muted">未验证</span>
            ) : (
              <span className="tool-status-pill muted">未保存</span>
            )}
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
              <div className="tool-password-input">
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={account ? "留空沿用已保存密码" : ""}
                  required={!account}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  className="tool-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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
              <button className="button primary-button" disabled={saving || isRemovingAccount || !username.trim() || (!password && !account)} type="submit">
                <Save size={18} />
                {saving ? "验证中" : account ? "更新账号" : "保存账号"}
              </button>
              {account ? (
                <button className="button secondary-button" disabled={isRemovingAccount} onClick={deleteAccount} type="button">
                  <Trash2 size={18} />
                  {isRemovingAccount ? "删除中" : "删除"}
                </button>
              ) : null}
            </div>
            {notice ? <p className="auth-message success">{notice}</p> : null}
            {error ? <p className="auth-message error">{error}</p> : null}
          </form>
        </DashboardCard>

        {showToolsCard ? (
          <DashboardCard className={`tool-detail-card zju-tools-card ${isRemovingAccount ? "is-removing" : ""}`}>
            <div className="zju-card-heading">
              <div>
                <p className="eyebrow">工具索引</p>
                <h2>ZJU 服务</h2>
              </div>
            </div>
            <div className="zju-hub">
              {toolCategories.map((category, index) => (
                <section className="zju-hub-category" key={category.key} style={{ animationDelay: `${index * 80}ms` }}>
                  <Link className="zju-hub-category-head" href={category.href}>
                    <span className="zju-hub-category-icon">{category.icon}</span>
                    <span className="zju-hub-category-title">
                      <small>{category.eyebrow}</small>
                      <strong>{category.name}</strong>
                    </span>
                  </Link>
                  <div className="zju-suite-grid">
                    {category.tools.map((tool) => (
                      <Link className="zju-suite-tool" href={tool.href} key={tool.href}>
                        <span>{tool.icon}</span>
                        <strong>{tool.title}</strong>
                        <p>{tool.text}</p>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </DashboardCard>
        ) : null}
      </div>
    </section>
  );
}
