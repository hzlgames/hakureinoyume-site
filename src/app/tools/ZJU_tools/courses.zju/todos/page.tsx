"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw, Search } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import {
  fetchJson,
  formatDateTime,
  formatDueDistance,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../_components";

type Todo = {
  courseId?: number | string | null;
  courseName: string;
  dueAt: string | null;
  id: number | string;
  source: "courses.zju" | "pintia";
  title: string;
  type: string;
  url: string;
};

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    homework: "作业",
    interaction: "课堂互动",
    "problem-set": "Pintia",
    quiz: "测验"
  };
  return labels[type] ?? type;
}

function dueTone(dueAt: string | null, baseTime: number) {
  if (!dueAt) return "muted" as const;
  const hours = (new Date(dueAt).getTime() - baseTime) / (60 * 60 * 1000);
  if (hours < 0) return "danger" as const;
  if (hours <= 24) return "active" as const;
  return "ok" as const;
}

export default function ZjuTodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [referenceNow, setReferenceNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [error, setError] = useState("");

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson<{ todos?: Todo[] }>("/api/zju/courses/todos");
      setTodos(payload.todos ?? []);
      setReferenceNow(Date.now());
      setLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "待办读取失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTodos(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTodos]);

  const filteredTodos = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return todos.filter((todo) => {
      if (source !== "all" && todo.source !== source) return false;
      if (!keyword) return true;
      return `${todo.title} ${todo.courseName} ${todo.type}`.toLowerCase().includes(keyword);
    });
  }, [query, source, todos]);

  const urgentCount = todos.filter((todo) => {
    if (!todo.dueAt) return false;
    const hours = (new Date(todo.dueAt).getTime() - referenceNow) / (60 * 60 * 1000);
    return hours >= 0 && hours <= 24;
  }).length;
  const pintiaCount = todos.filter((todo) => todo.source === "pintia").length;

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju/todos">
      <ZjuToolShell
        actions={(
          <button className="button primary-button" disabled={loading} onClick={loadTodos} type="button">
            <RefreshCcw size={18} />
            {loading ? "刷新中" : "刷新待办"}
          </button>
        )}
        lead="汇总学在浙大与 Pintia 待办，按截止时间、来源和关键词快速定位。"
        title="待办中心"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-metric-grid">
          <ZjuMetricCard detail={loadedAt ? `更新于 ${formatDateTime(loadedAt)}` : "尚未刷新"} label="待办总数" value={todos.length} />
          <ZjuMetricCard detail="24 小时内截止" label="紧急事项" value={urgentCount} />
          <ZjuMetricCard detail="需要配置 Pintia Cookie" label="Pintia" value={pintiaCount} />
        </div>

        <DashboardCard className="tool-detail-card zju-control-card">
          <div className="zju-filter-grid">
            <label className="zju-search-field">
              <Search size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、课程或类型"
                type="search"
                value={query}
              />
            </label>
            <select className="tool-select" onChange={(event) => setSource(event.target.value)} value={source}>
              <option value="all">全部来源</option>
              <option value="courses.zju">学在浙大</option>
              <option value="pintia">Pintia</option>
            </select>
          </div>
        </DashboardCard>

        <div className="zju-todo-list">
          {filteredTodos.length === 0 ? (
            <DashboardCard className="tool-detail-card zju-empty-state">
              {loading ? "正在读取待办..." : "当前筛选下没有待办。"}
            </DashboardCard>
          ) : null}
          {filteredTodos.map((todo) => (
            <a className="zju-todo-row" href={todo.url} key={`${todo.source}-${todo.id}`} rel="noreferrer" target="_blank">
              <div className="zju-todo-main">
                <div className="zju-todo-title-line">
                  <strong>{todo.title}</strong>
                  <ZjuStatusPill tone={dueTone(todo.dueAt, referenceNow)}>{formatDueDistance(todo.dueAt, referenceNow)}</ZjuStatusPill>
                </div>
                <p>{todo.courseName}</p>
                <div className="zju-tag-row">
                  <span>{todo.source === "pintia" ? "Pintia" : "学在浙大"}</span>
                  <span>{typeLabel(todo.type)}</span>
                  <span>{formatDateTime(todo.dueAt)}</span>
                </div>
              </div>
              <ExternalLink size={18} />
            </a>
          ))}
        </div>
      </ZjuToolShell>
    </ZjuAuthGate>
  );
}
