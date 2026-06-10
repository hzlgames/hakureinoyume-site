"use client";

import Link from "next/link";
import type { CSSProperties, ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ImagePlus,
  KeyRound,
  LogOut,
  RefreshCcw,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Upload,
  Users
} from "lucide-react";
import {
  applyThemeVars,
  backgrounds,
  createCustomBackground,
  siteName,
  storageKeys
} from "../site-theme";
import { signOut, useSession } from "../../lib/auth-client";

type PublicBackgroundResponse = {
  custom: {
    src: string;
    updatedAt?: string;
  } | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  _count: {
    sessions: number;
  };
};

type AuditLog = {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    email: string;
    name: string;
  } | null;
};

type UsersResponse = {
  auditLogs: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: AdminUser[];
};

const outputWidth = 1600;
const outputHeight = 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCroppedImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
  const imageOffsetX = clamp((offsetX / 100) * width, -maxOffsetX, maxOffsetX);
  const imageOffsetY = clamp((offsetY / 100) * height, -maxOffsetY, maxOffsetY);
  const drawX = (width - drawWidth) / 2 + imageOffsetX;
  const drawY = (height - drawHeight) / 2 + imageOffsetY;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#1d1720";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function roleLabel(role: string | null) {
  return role === "admin" ? "管理员" : "用户";
}

export default function AdminPage() {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const { data: session, isPending } = useSession();
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(1.08);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [serverBackground, setServerBackground] =
    useState<PublicBackgroundResponse["custom"]>(null);
  const [usersPayload, setUsersPayload] = useState<UsersResponse | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [page, setPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userNotice, setUserNotice] = useState("");

  const isAdmin = session?.user.role === "admin";

  const activeBackground = useMemo(() => {
    if (serverBackground?.src) {
      return createCustomBackground(serverBackground.src);
    }

    return backgrounds[0];
  }, [serverBackground]);

  useEffect(() => {
    applyThemeVars(activeBackground.theme);
  }, [activeBackground]);

  useEffect(() => {
    fetch("/api/background", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: PublicBackgroundResponse) => setServerBackground(payload.custom))
      .catch(() => undefined);
  }, []);

  const loadUsers = useCallback(async (nextPage: number, search: string) => {
    if (!isAdmin) {
      return;
    }

    setUsersLoading(true);
    setUserNotice("");

    const params = new URLSearchParams({
      page: String(nextPage)
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("load_users_failed");
      }

      setUsersPayload(await response.json() as UsersResponse);
    } catch {
      setUserNotice("账号数据加载失败。");
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      queueMicrotask(() => {
        loadUsers(1, "");
      });
    }
  }, [isAdmin, loadUsers]);

  useEffect(() => {
    if (!sourceImage) {
      return;
    }

    let cancelled = false;

    loadImage(sourceImage)
      .then((image) => {
        if (cancelled || !previewRef.current) {
          return;
        }

        previewRef.current.width = 1200;
        previewRef.current.height = 750;
        drawCroppedImage(previewRef.current, image, zoom, offsetX, offsetY);
      })
      .catch(() => setNotice("图片预览失败，请换一张图片。"));

    return () => {
      cancelled = true;
    };
  }, [offsetX, offsetY, sourceImage, zoom]);

  async function handleLogout() {
    await signOut();
    window.location.href = "/";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setNotice("请选择图片文件。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setNotice("图片不能超过 10MB。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(String(reader.result));
      setFileName(file.name);
      setZoom(1.08);
      setOffsetX(0);
      setOffsetY(0);
      setNotice("");
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveBackground() {
    if (!sourceImage) {
      setNotice("请先选择图片。");
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const image = await loadImage(sourceImage);
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      drawCroppedImage(canvas, image, zoom, offsetX, offsetY);

      const imageData = canvas.toDataURL("image/webp", 0.86);
      const response = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData })
      });

      if (!response.ok) {
        throw new Error("upload_failed");
      }

      const payload = (await response.json()) as PublicBackgroundResponse;
      setServerBackground(payload.custom);
      window.localStorage.setItem(storageKeys.selectedBackground, "custom");
      setNotice("背景图已保存。");
      loadUsers(page, userSearch);
    } catch {
      setNotice("保存失败，请确认管理员登录状态。");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetBackground() {
    setSaving(true);
    setNotice("");

    try {
      const response = await fetch("/api/background", { method: "DELETE" });

      if (!response.ok) {
        throw new Error("delete_failed");
      }

      setServerBackground(null);
      window.localStorage.setItem(storageKeys.selectedBackground, backgrounds[0].id);
      setNotice("已恢复预设背景。");
      loadUsers(page, userSearch);
    } catch {
      setNotice("重置失败，请确认管理员登录状态。");
    } finally {
      setSaving(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    await loadUsers(1, userSearch);
  }

  async function mutateUser(path: string, init: RequestInit, success: string) {
    setUserNotice("");
    const response = await fetch(path, init);

    if (!response.ok) {
      setUserNotice("操作失败，请刷新后重试。");
      return;
    }

    setUserNotice(success);
    await loadUsers(page, userSearch);
  }

  async function updateRole(user: AdminUser) {
    const nextRole = user.role === "admin" ? "user" : "admin";

    await mutateUser(
      `/api/admin/users/${user.id}/role`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole })
      },
      `已更新为${roleLabel(nextRole)}。`
    );
  }

  async function toggleBan(user: AdminUser) {
    await mutateUser(
      `/api/admin/users/${user.id}/ban`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banned: !user.banned,
          reason: "管理员后台操作"
        })
      },
      user.banned ? "账号已恢复。" : "账号已停用，现有会话已撤销。"
    );
  }

  async function revokeSessions(user: AdminUser) {
    await mutateUser(
      `/api/admin/users/${user.id}/sessions`,
      { method: "DELETE" },
      "该用户会话已撤销。"
    );
  }

  async function resetPassword(user: AdminUser) {
    const password = window.prompt(`为 ${user.email} 设置新密码，至少 8 位。`);

    if (!password) {
      return;
    }

    await mutateUser(
      `/api/admin/users/${user.id}/password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      },
      "密码已重置。"
    );
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    loadUsers(nextPage, userSearch);
  }

  const pageStyle = {
    "--hero-background": `url(${activeBackground.src})`,
    "--theme-accent": activeBackground.accent,
    ...activeBackground.theme
  } as CSSProperties;

  return (
    <div className="home-scene admin-scene" style={pageStyle}>
      <div className="ambient-layer" aria-hidden="true">
        <span className="spell-ring spell-ring-one" />
        <span className="spell-ring spell-ring-two" />
        <span className="spell-ring spell-ring-three" />
        <span className="energy-ribbon energy-ribbon-one" />
        <span className="energy-ribbon energy-ribbon-two" />
        <span className="ofuda ofuda-one" />
        <span className="petal petal-one" />
        <span className="danmaku danmaku-one" />
      </div>

      <section className="admin-shell" aria-labelledby="admin-title">
        <div className="section-heading admin-heading">
          <p className="eyebrow">{siteName}</p>
          <h1 id="admin-title">管理后台</h1>
          <p>账号、会话与站点背景管理</p>
        </div>

        {isPending ? (
          <div className="portal-card admin-card">
            <p>Session</p>
            <h2>正在校验</h2>
          </div>
        ) : !session ? (
          <div className="portal-card admin-card auth-required-card">
            <Shield size={28} />
            <h2>需要登录</h2>
            <p>管理员后台已迁移到正式账号系统。</p>
            <Link className="button primary-button" href="/login?callback=/admin">
              登录
            </Link>
          </div>
        ) : !isAdmin ? (
          <div className="portal-card admin-card auth-required-card">
            <Ban size={28} />
            <h2>无管理员权限</h2>
            <p>当前账号没有访问后台的权限。</p>
            <div className="admin-actions">
              <Link className="button primary-button" href="/">
                返回首页
              </Link>
              <button className="button ghost-button" onClick={handleLogout} type="button">
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-dashboard">
            <div className="admin-toolbar portal-card">
              <div>
                <p>Signed in</p>
                <h2>{session.user.name}</h2>
                <span>{session.user.email}</span>
              </div>
              <div className="admin-toolbar-actions">
                <Link className="button ghost-button" href="/">
                  返回首页
                </Link>
                <button className="button ghost-button" onClick={handleLogout} type="button">
                  <LogOut size={16} />
                  退出
                </button>
              </div>
            </div>

            <div className="admin-grid">
              <section className="portal-card admin-card crop-card" aria-label="背景图裁切">
                <div className="card-title-row">
                  <div>
                    <p>Background</p>
                    <h2>更换背景图</h2>
                  </div>
                  <ImagePlus size={22} />
                </div>

                <label className="file-drop">
                  <input
                    accept="image/avif,image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    type="file"
                  />
                  <Upload size={18} />
                  <span>{fileName || "选择图片"}</span>
                </label>

                <div className="crop-preview">
                  {sourceImage ? (
                    <canvas ref={previewRef} />
                  ) : (
                    <div className="empty-preview">16:10</div>
                  )}
                </div>

                <div className="control-grid">
                  <label>
                    <span>缩放</span>
                    <input
                      max="2.2"
                      min="1"
                      onChange={(event) => setZoom(Number(event.target.value))}
                      step="0.01"
                      type="range"
                      value={zoom}
                    />
                  </label>
                  <label>
                    <span>水平</span>
                    <input
                      max="50"
                      min="-50"
                      onChange={(event) => setOffsetX(Number(event.target.value))}
                      step="1"
                      type="range"
                      value={offsetX}
                    />
                  </label>
                  <label>
                    <span>垂直</span>
                    <input
                      max="50"
                      min="-50"
                      onChange={(event) => setOffsetY(Number(event.target.value))}
                      step="1"
                      type="range"
                      value={offsetY}
                    />
                  </label>
                </div>

                <div className="admin-actions">
                  <button
                    className="button primary-button"
                    disabled={saving || !sourceImage}
                    onClick={handleSaveBackground}
                    type="button"
                  >
                    {saving ? "保存中" : "保存背景"}
                  </button>
                  <button
                    className="button ghost-button"
                    disabled={saving}
                    onClick={handleResetBackground}
                    type="button"
                  >
                    <RotateCcw size={16} />
                    恢复预设
                  </button>
                </div>

                {notice ? <p className="admin-notice">{notice}</p> : null}
              </section>

              <aside className="portal-card admin-card admin-status">
                <p>Current</p>
                <h2>{serverBackground ? "自定义背景已启用" : "当前使用预设背景"}</h2>
                <dl>
                  <div>
                    <dt>输出比例</dt>
                    <dd>16:10</dd>
                  </div>
                  <div>
                    <dt>输出尺寸</dt>
                    <dd>
                      {outputWidth} x {outputHeight}
                    </dd>
                  </div>
                  <div>
                    <dt>认证系统</dt>
                    <dd>Better Auth</dd>
                  </div>
                </dl>
              </aside>
            </div>

            <section className="portal-card admin-card users-card">
              <div className="card-title-row">
                <div>
                  <p>Accounts</p>
                  <h2>账号后台</h2>
                </div>
                <Users size={22} />
              </div>

              <form className="admin-search" onSubmit={submitSearch}>
                <Search size={18} />
                <input
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="搜索邮箱或昵称"
                  type="search"
                  value={userSearch}
                />
                <button className="button ghost-button" disabled={usersLoading} type="submit">
                  搜索
                </button>
                <button
                  className="icon-button compact"
                  disabled={usersLoading}
                  onClick={() => loadUsers(page, userSearch)}
                  type="button"
                >
                  <RefreshCcw size={16} />
                </button>
              </form>

              {userNotice ? <p className="admin-notice">{userNotice}</p> : null}

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>账号</th>
                      <th>验证</th>
                      <th>角色</th>
                      <th>状态</th>
                      <th>会话</th>
                      <th>创建</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersPayload?.users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <span>{user.email}</span>
                        </td>
                        <td>
                          <span className={`status-pill ${user.emailVerified ? "ok" : "muted"}`}>
                            {user.emailVerified ? <CheckCircle2 size={14} /> : null}
                            {user.emailVerified ? "已验证" : "未验证"}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${user.role === "admin" ? "admin" : "muted"}`}>
                            {user.role === "admin" ? <ShieldCheck size={14} /> : null}
                            {roleLabel(user.role)}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${user.banned ? "danger" : "ok"}`}>
                            {user.banned ? "已停用" : "正常"}
                          </span>
                        </td>
                        <td>{user._count.sessions}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          <div className="table-actions">
                            <button onClick={() => updateRole(user)} type="button">
                              {user.role === "admin" ? "设为用户" : "设为管理员"}
                            </button>
                            <button onClick={() => toggleBan(user)} type="button">
                              {user.banned ? "恢复" : "停用"}
                            </button>
                            <button onClick={() => revokeSessions(user)} type="button">
                              撤销会话
                            </button>
                            <button onClick={() => resetPassword(user)} type="button">
                              <KeyRound size={14} />
                              重置密码
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!usersPayload?.users.length ? (
                      <tr>
                        <td colSpan={7}>暂无账号数据。</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {usersPayload ? (
                <div className="admin-pagination">
                  <span>
                    第 {usersPayload.page} / {usersPayload.totalPages} 页 · 共 {usersPayload.total} 个账号
                  </span>
                  <div>
                    <button
                      className="button ghost-button"
                      disabled={usersPayload.page <= 1 || usersLoading}
                      onClick={() => changePage(Math.max(1, usersPayload.page - 1))}
                      type="button"
                    >
                      上一页
                    </button>
                    <button
                      className="button ghost-button"
                      disabled={usersPayload.page >= usersPayload.totalPages || usersLoading}
                      onClick={() => changePage(Math.min(usersPayload.totalPages, usersPayload.page + 1))}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="portal-card admin-card audit-card">
              <div className="card-title-row">
                <div>
                  <p>Audit</p>
                  <h2>操作记录</h2>
                </div>
              </div>
              <div className="audit-list">
                {usersPayload?.auditLogs.map((log) => (
                  <div className="audit-item" key={log.id}>
                    <div>
                      <strong>{log.action}</strong>
                      <span>{log.actor?.email ?? "system"}</span>
                    </div>
                    <time>{formatDate(log.createdAt)}</time>
                  </div>
                ))}
                {!usersPayload?.auditLogs.length ? <p className="admin-muted">暂无操作记录。</p> : null}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
