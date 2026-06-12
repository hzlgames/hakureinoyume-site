"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, RefreshCcw } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import {
  Course,
  CoursePicker,
  fetchJson,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../_components";

type Score = {
  id: number | string;
  score: string;
  title: string;
  type: "作业" | "考试";
};

function parseScore(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ZjuScoresPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState("");
  const [loadedCourseId, setLoadedCourseId] = useState("");
  const [error, setError] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading("courses");
    setError("");
    try {
      const payload = await fetchJson<{ courses?: Course[] }>("/api/zju/courses");
      const nextCourses = payload.courses ?? [];
      setCourses(nextCourses);
      setSelectedCourseId((current) => current || String(nextCourses[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "课程读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  const loadScores = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading("scores");
    setError("");
    try {
      const payload = await fetchJson<{ scores?: Score[] }>(`/api/zju/courses/${selectedCourseId}/scores`);
      setScores(payload.scores ?? []);
      setLoadedCourseId(selectedCourseId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "分数读取失败。");
    } finally {
      setLoading("");
    }
  }, [selectedCourseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCourses(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCourses]);

  const stats = useMemo(() => {
    const numericScores = scores.map((score) => parseScore(score.score)).filter((score): score is number => score !== null);
    const average = numericScores.length > 0
      ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
      : null;

    return {
      average,
      exams: scores.filter((score) => score.type === "考试").length,
      homework: scores.filter((score) => score.type === "作业").length
    };
  }, [scores]);

  const selectedCourse = courses.find((course) => String(course.id) === loadedCourseId);

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju/scores">
      <ZjuToolShell
        actions={(
          <button className="button primary-button" disabled={!selectedCourseId || loading === "scores"} onClick={loadScores} type="button">
            <RefreshCcw size={18} />
            {loading === "scores" ? "查询中" : "查询分数"}
          </button>
        )}
        lead="选择课程后读取作业与考试分数，自动汇总数量和可计算的平均值。"
        title="成绩查询"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-detail-layout">
          <CoursePicker
            courses={courses}
            disabled={loading === "courses"}
            onRefresh={loadCourses}
            onSelect={setSelectedCourseId}
            selectedCourseId={selectedCourseId}
          />

          <div className="zju-detail-main">
            <div className="zju-metric-grid">
              <ZjuMetricCard detail={selectedCourse?.name ?? "选择课程后查询"} label="记录数" value={scores.length} />
              <ZjuMetricCard detail="可解析数字分数" label="平均分" value={stats.average ?? "—"} />
              <ZjuMetricCard detail={`${stats.homework} 项作业 / ${stats.exams} 项考试`} label="类型分布" value={<BookOpen size={28} />} />
            </div>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <BookOpen size={18} />
                  分数明细
                </div>
                {loadedCourseId ? <ZjuStatusPill tone="muted">课程 ID {loadedCourseId}</ZjuStatusPill> : null}
              </div>
              <div className="zju-score-table">
                {scores.length === 0 ? <p className="tool-empty">{loading === "scores" ? "正在读取分数..." : "选择课程后点击查询分数。"}</p> : null}
                {scores.map((score) => (
                  <div className="zju-score-row" key={`${score.type}-${score.id}`}>
                    <div>
                      <strong>{score.title}</strong>
                      <span>{score.type} · ID {score.id}</span>
                    </div>
                    <ZjuStatusPill tone={score.score === "—" ? "muted" : "ok"}>{score.score}</ZjuStatusPill>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        </div>
      </ZjuToolShell>
    </ZjuAuthGate>
  );
}
