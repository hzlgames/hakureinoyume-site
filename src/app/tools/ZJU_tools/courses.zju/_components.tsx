"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, GraduationCap, KeyRound } from "lucide-react";
import { DashboardCard } from "../../../_components/ui";
import { useSession } from "../../../../lib/auth-client";

export type Course = {
  code: string;
  id: number;
  instructors: string[];
  name: string;
  status: string;
};

export type Job = {
  id: string;
  createdAt: string;
  error: string | null;
  logs: string;
  output: unknown;
  status: string;
  tool: string;
};

type AccountPayload = {
  account: {
    isValid: boolean;
    lastValidatedAt: string | null;
    username: string;
  } | null;
};

export function formatDateTime(value: string | null) {
  if (!value) return "无截止时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatFullDateTime(value: string | null) {
  if (!value) return "无时间";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDueDistance(value: string | null, baseTime: number) {
  if (!value) return "无截止";
  const delta = new Date(value).getTime() - baseTime;
  const abs = Math.abs(delta);
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;
  const prefix = delta >= 0 ? "剩余" : "已过";

  if (abs >= day) return `${prefix} ${Math.ceil(abs / day)} 天`;
  if (abs >= hour) return `${prefix} ${Math.ceil(abs / hour)} 小时`;
  return `${prefix} ${Math.max(1, Math.ceil(abs / minute))} 分钟`;
}

export function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${Math.round(size / Math.pow(1024, index))} ${units[index]}`;
}

export function outputFiles(output: unknown): Array<{ name: string; size: number }> {
  if (typeof output !== "object" || output === null || !("files" in output)) return [];
  const files = (output as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];

  return files.filter((item): item is { name: string; size: number } => {
    return typeof item === "object"
      && item !== null
      && typeof (item as { name?: unknown }).name === "string"
      && typeof (item as { size?: unknown }).size === "number";
  });
}

export function toolStatusLabel(status: string) {
  const labels: Record<string, string> = {
    cancelled: "已取消",
    failed: "失败",
    queued: "排队中",
    running: "运行中",
    succeeded: "已完成"
  };
  return labels[status] ?? status;
}

export function toolStatusTone(status: string) {
  if (status === "failed") return "danger";
  if (status === "cancelled") return "muted";
  if (status === "queued" || status === "running") return "active";
  return "ok";
}

export function ZjuAuthGate({
  callback,
  children
}: {
  callback: string;
  children: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? "";
  const [accountState, setAccountState] = useState({
    checked: false,
    error: "",
    isValid: false,
    userId: ""
  });
  const accountChecked = accountState.checked && accountState.userId === userId;
  const hasValidAccount = accountChecked && accountState.isValid;
  const accountError = accountChecked ? accountState.error : "";

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    fetch("/api/zju/account")
      .then((response) => response.json())
      .then((payload: AccountPayload) => {
        if (cancelled) return;
        setAccountState({
          checked: true,
          error: "",
          isValid: Boolean(payload.account?.isValid),
          userId
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAccountState({
            checked: true,
            error: "读取 ZJU 账号状态失败。",
            isValid: false,
            userId
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isPending || (userId && !accountChecked)) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card">加载中...</DashboardCard>
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card zju-auth-card">
          <p className="eyebrow">学在浙大</p>
          <h1>请先登录</h1>
          <p className="lead">登录本站账号后，才能读取 ZJU 凭据并使用学在浙大工具。</p>
          <Link className="button primary-button tool-inline-button" href={`/login?callback=${encodeURIComponent(callback)}`}>
            <KeyRound size={18} />
            登录
          </Link>
        </DashboardCard>
      </section>
    );
  }

  if (!hasValidAccount) {
    return (
      <section className="page-shell tools-page">
        <DashboardCard className="tool-detail-card zju-auth-card">
          <p className="eyebrow">学在浙大</p>
          <h1>请先验证 ZJU 账号</h1>
          <p className="lead">{accountError || "保存并验证学号密码后，才能打开具体工具页面。"}</p>
          <Link className="button primary-button tool-inline-button" href="/tools/ZJU_tools">
            <KeyRound size={18} />
            前往验证
          </Link>
        </DashboardCard>
      </section>
    );
  }

  return children;
}

export function ZjuToolShell({
  actions,
  backHref = "/tools/ZJU_tools/courses.zju",
  backLabel = "课程助手",
  children,
  eyebrow = "学在浙大",
  lead,
  title
}: {
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  eyebrow?: string;
  lead: string;
  title: string;
}) {
  return (
    <section className="page-shell tools-page zju-tool-page">
      <div className="zju-tool-heading">
        <div>
          <Link className="zju-back-link" href={backHref}>
            <ArrowLeft size={16} />
            {backLabel}
          </Link>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
        </div>
        {actions ? <div className="zju-heading-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ZjuMetricCard({
  label,
  value,
  detail
}: {
  detail?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <DashboardCard className="zju-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </DashboardCard>
  );
}

export function ZjuStatusPill({
  children,
  tone = "ok"
}: {
  children: ReactNode;
  tone?: "active" | "danger" | "muted" | "ok";
}) {
  return <span className={`tool-status-pill ${tone}`}>{children}</span>;
}

export function ZjuErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return <p className="auth-message error zju-page-message">{message}</p>;
}

export function CoursePicker({
  courses,
  disabled,
  onRefresh,
  onSelect,
  selectedCourseId
}: {
  courses: Course[];
  disabled?: boolean;
  onRefresh: () => void;
  onSelect: (courseId: string) => void;
  selectedCourseId: string;
}) {
  const selectedCourse = courses.find((course) => String(course.id) === selectedCourseId) ?? null;

  return (
    <DashboardCard className="tool-detail-card zju-course-selector">
      <div className="zju-card-heading">
        <div className="card-title">
          <GraduationCap size={18} />
          选择课程
        </div>
        <button className="button secondary-button compact-button" disabled={disabled} onClick={onRefresh} type="button">
          刷新课程
        </button>
      </div>
      <select
        className="tool-select"
        disabled={disabled || courses.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        value={selectedCourseId}
      >
        {courses.length === 0 ? <option value="">暂无课程</option> : null}
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name}
          </option>
        ))}
      </select>
      {selectedCourse ? (
        <dl className="zju-course-facts">
          <div>
            <dt>课程代码</dt>
            <dd>{selectedCourse.code || "未提供"}</dd>
          </div>
          <div>
            <dt>教师</dt>
            <dd>{selectedCourse.instructors.join(" / ") || "未提供"}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{selectedCourse.status || "未知"}</dd>
          </div>
        </dl>
      ) : (
        <p className="tool-empty">请先在 ZJU 工具合集页保存账号，然后刷新课程。</p>
      )}
    </DashboardCard>
  );
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? "请求失败。");
  }
  return payload;
}
