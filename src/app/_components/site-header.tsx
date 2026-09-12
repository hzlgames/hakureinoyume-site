"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  UserPlus,
  X,
} from "lucide-react";
import { signOut, useSession } from "../../lib/auth-client";

function subscribeTheme(callback: () => void) {
  window.addEventListener("site-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("site-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function readTheme() {
  try {
    return localStorage.getItem("hakurei-color-mode") === "dark"
      ? "dark"
      : "light";
  } catch {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
}
const links = [
  { href: "/", label: "首页" },
  { href: "/#study", label: "学习" },
  { href: "/#life", label: "生活" },
  { href: "/#touhou", label: "东方" },
  { href: "/tools", label: "工具" },
  { href: "/#about", label: "关于" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  const [panel, setPanel] = useState<
    "menu" | "search" | "notifications" | null
  >(null);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("hakurei-color-mode", next);
    } catch {}
    window.dispatchEvent(new Event("site-theme-change"));
  }
  const active = pathname.startsWith("/tools")
    ? "/tools"
    : pathname === "/"
      ? "/"
      : "";
  const destinations = [
    ...links,
    { href: "/tools/ZJU_tools", label: "ZJU 工具合集" },
    { href: "/login", label: "登录账号" },
  ];
  return (
    <header className="header site-header" ref={root}>
      <Link
        className="header-left"
        href="/"
        aria-label="博麗の夢首页"
        onClick={() => setPanel(null)}
      >
        <span className="header-logo" aria-hidden="true">
          ☯
        </span>
        <span>博麗の夢</span>
      </Link>
      <nav className="site-navigation" aria-label="主导航">
        {links.map((link) => (
          <Link
            className={`nav-item ${active === link.href ? "active" : ""}`}
            aria-current={active === link.href ? "page" : undefined}
            href={link.href}
            key={link.label}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="header-right">
        {(["search", "notifications", "menu"] as const).map((item) => {
          const Icon =
            item === "search"
              ? Search
              : item === "notifications"
                ? Bell
                : panel === "menu"
                  ? X
                  : Menu;
          const label =
            item === "search"
              ? "搜索导航"
              : item === "notifications"
                ? "通知"
                : "展开导航";
          return (
            <button
              key={item}
              type="button"
              className={`site-icon ${item === "menu" ? "site-menu-toggle" : ""}`}
              aria-label={label}
              title={label}
              aria-expanded={panel === item}
              aria-controls="site-header-panel"
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setPanel(panel === item ? null : item);
              }}
            >
              <Icon size={19} />
            </button>
          );
        })}
        <button
          className="site-icon"
          type="button"
          aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}
          title={theme === "light" ? "切换深色模式" : "切换浅色模式"}
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <div className="header-account" aria-busy={isPending}>
          {session?.user ? (
            <>
              {session.user.role === "admin" && (
                <Link
                  className="header-auth-link"
                  href="/admin"
                  aria-label="账号管理"
                >
                  <ShieldCheck size={16} />
                  <span>管理</span>
                </Link>
              )}
              <span className="header-user-name" title={session.user.name}>
                {session.user.name}
              </span>
              <button
                className="site-icon"
                aria-label="退出登录"
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  setError("");
                  try {
                    const result = await signOut();
                    if (result.error) throw new Error();
                    window.location.reload();
                  } catch {
                    setError("退出失败，请重试。");
                    setSigningOut(false);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link className="header-auth-link" href="/login">
                <LogIn size={16} />
                登录
              </Link>
              <Link
                className="site-icon site-register"
                href="/register"
                aria-label="注册账号"
              >
                <UserPlus size={18} />
              </Link>
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="site-header-error" role="alert">
          {error}
        </div>
      )}
      {panel && (
        <div className="site-header-panel" id="site-header-panel">
          {panel === "menu" && (
            <nav aria-label="移动端导航">
              {session?.user && (
                <p className="mobile-account-summary">
                  当前账号 · {session.user.name}
                </p>
              )}
              {links.map((link) => (
                <Link
                  href={link.href}
                  key={link.label}
                  className={active === link.href ? "active" : ""}
                  onClick={() => setPanel(null)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
          {panel === "notifications" && (
            <>
              <strong>通知</strong>
              <p>暂无站内通知。</p>
            </>
          )}
          {panel === "search" && (
            <>
              <label htmlFor="site-search">快速前往</label>
              <input
                autoFocus
                id="site-search"
                placeholder="搜索页面，如工具、学习…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <nav aria-label="搜索结果">
                {destinations
                  .filter((link) =>
                    link.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((link) => (
                    <Link
                      href={link.href}
                      key={link.label}
                      onClick={() => setPanel(null)}
                    >
                      {link.label}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))}
              </nav>
              {!destinations.some((link) =>
                link.label.toLowerCase().includes(query.toLowerCase()),
              ) && <p>没有匹配的页面，试试“工具”。</p>}
            </>
          )}
        </div>
      )}
    </header>
  );
}
