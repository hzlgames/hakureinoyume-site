"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, KeyRound, Lightbulb, RefreshCcw, XCircle } from "lucide-react";
import { DashboardCard } from "../../../../_components/ui";
import {
  fetchJson,
  formatFullDateTime,
  Job,
  toolStatusLabel,
  toolStatusTone,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../_components";

type QuizCourse = {
  id: string;
  name: string;
};

type QuizClassroom = {
  id: string;
  title: string;
};

type QuizAnswer = {
  content: string;
  label: string;
};

type QuizOption = {
  content: string;
  isAnswer: boolean;
  label: string;
};

type QuizSubject = {
  answers: QuizAnswer[];
  description: string;
  id: string;
  options: QuizOption[];
  point: string;
  type: string;
};

const typeLabel: Record<string, string> = {
  single_selection: "单选",
  multiple_selection: "多选",
  true_or_false: "判断",
  fill_in_blank: "填空"
};

const NO_SELECTED_JOB = "__no_selected_job__";

function readQuizSubjects(output: unknown): QuizSubject[] {
  if (typeof output !== "object" || output === null || !("subjects" in output)) return [];
  const subjects = (output as { subjects?: unknown }).subjects;
  if (!Array.isArray(subjects)) return [];

  return subjects.filter((subject): subject is QuizSubject => {
    if (typeof subject !== "object" || subject === null) return false;
    const record = subject as Partial<QuizSubject>;
    return Array.isArray(record.answers)
      && typeof record.description === "string"
      && typeof record.id === "string"
      && Array.isArray(record.options)
      && typeof record.point === "string"
      && typeof record.type === "string";
  });
}

export default function ZjuQuizPage() {
  const [courses, setCourses] = useState<QuizCourse[]>([]);
  const [classrooms, setClassrooms] = useState<QuizClassroom[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [activeJobId, setActiveJobId] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading("courses");
    setError("");
    try {
      const payload = await fetchJson<{ courses?: QuizCourse[] }>("/api/zju/quiz/courses");
      const nextCourses = payload.courses ?? [];
      setCourses(nextCourses);
      setSelectedCourseId((current) => current || String(nextCourses[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "课程读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const payload = await fetchJson<{ jobs?: Job[] }>("/api/zju/jobs");
      setJobs((payload.jobs ?? []).filter((job) => job.tool === "courses.zju/quiz"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务读取失败。");
    }
  }, []);

  const loadClassrooms = useCallback(async (courseId: string) => {
    if (!courseId) return;
    setLoading("classrooms");
    setError("");
    try {
      const payload = await fetchJson<{ classrooms?: QuizClassroom[] }>(`/api/zju/quiz/courses/${courseId}/classrooms`);
      const nextClassrooms = payload.classrooms ?? [];
      setClassrooms(nextClassrooms);
      setSelectedClassroomId(String(nextClassrooms[0]?.id ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "互动列表读取失败。");
    } finally {
      setLoading("");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCourses();
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCourses, loadJobs]);

  useEffect(() => {
    if (!jobs.some((job) => ["queued", "running"].includes(job.status))) return;
    const timer = window.setInterval(() => void loadJobs().catch(() => undefined), 1800);
    return () => window.clearInterval(timer);
  }, [jobs, loadJobs]);

  function selectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setClassrooms([]);
    setSelectedClassroomId("");
    setActiveJobId(NO_SELECTED_JOB);
  }

  async function loadAnswers() {
    if (!selectedClassroomId) return;
    setLoading("answers");
    setError("");
    try {
      const classroom = classrooms.find((item) => item.id === selectedClassroomId);
      const payload = await fetchJson<{ job?: Job }>("/api/zju/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tool: "courses.zju/quiz",
          classroomId: selectedClassroomId,
          title: classroom?.title ?? ""
        })
      });
      setActiveJobId(payload.job?.id ?? "");
      await loadJobs();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "任务启动失败。");
    } finally {
      setLoading("");
    }
  }

  async function cancelJob(jobId: string) {
    setError("");
    try {
      await fetchJson<{ ok: boolean }>(`/api/zju/jobs/${jobId}`, { method: "DELETE" });
      await loadJobs();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "任务取消失败。");
    }
  }

  const selectedJob = activeJobId === NO_SELECTED_JOB
    ? null
    : (activeJobId ? jobs.find((job) => job.id === activeJobId) ?? null : jobs[0] ?? null);
  const subjects = selectedJob?.status === "succeeded" ? readQuizSubjects(selectedJob.output) : [];

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/courses.zju/quiz">
      <ZjuToolShell
        actions={(
          <button className="button primary-button" disabled={!selectedClassroomId || loading === "answers"} onClick={loadAnswers} type="button">
            <KeyRound size={18} />
            {loading === "answers" ? "创建中" : "创建任务"}
          </button>
        )}
        lead="读取学在浙大互动测验（“互动”进入的 quiz）的参考答案。"
        title="测验答案"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-detail-layout">
          <div className="zju-side-stack">
            <DashboardCard className="tool-detail-card zju-course-selector">
              <div className="zju-card-heading">
                <div className="card-title">
                  <Lightbulb size={18} />
                  选择互动
                </div>
                <button className="button secondary-button compact-button" disabled={loading === "courses"} onClick={loadCourses} type="button">
                  刷新课程
                </button>
              </div>
              <select
                className="tool-select"
                disabled={loading === "courses" || courses.length === 0}
                onChange={(event) => selectCourse(event.target.value)}
                value={selectedCourseId}
              >
                {courses.length === 0 ? <option value="">暂无课程</option> : null}
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <div className="tool-action-row zju-rhythm-actions">
                <button className="button secondary-button" disabled={!selectedCourseId || loading === "classrooms"} onClick={() => loadClassrooms(selectedCourseId)} type="button">
                  <RefreshCcw size={18} />
                  {loading === "classrooms" ? "读取中" : "读取互动"}
                </button>
              </div>
              <select
                className="tool-select zju-quiz-classroom-select"
                disabled={classrooms.length === 0}
                onChange={(event) => {
                  setSelectedClassroomId(event.target.value);
                  setActiveJobId(NO_SELECTED_JOB);
                }}
                value={selectedClassroomId}
              >
                {classrooms.length === 0 ? <option value="">先读取进行中的互动</option> : null}
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.title}
                  </option>
                ))}
              </select>
            </DashboardCard>
          </div>

          <div className="zju-detail-main">
            <div className="zju-metric-grid">
              <ZjuMetricCard detail="进行中的互动" label="互动数" value={classrooms.length} />
              <ZjuMetricCard detail="当前互动题目" label="题目数" value={subjects.length} />
              <ZjuMetricCard detail="courses.zju.edu.cn" label="数据源" value={<HelpCircle size={28} />} />
            </div>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <KeyRound size={18} />
                  读取任务
                </div>
                <button className="icon-action-button" onClick={() => void loadJobs()} title="刷新任务" type="button">
                  <RefreshCcw size={17} />
                </button>
              </div>
              <div className="zju-job-list">
                {jobs.length === 0 ? <p className="tool-empty">暂无任务。</p> : null}
                {jobs.map((job) => {
                  const active = ["queued", "running"].includes(job.status);
                  return (
                    <div className="zju-job" key={job.id}>
                      <div className="zju-job-header">
                        <div>
                          <ZjuStatusPill tone={toolStatusTone(job.status)}>{toolStatusLabel(job.status)}</ZjuStatusPill>
                          <span>{formatFullDateTime(job.createdAt)}</span>
                        </div>
                        {active ? (
                          <button className="icon-action-button" onClick={() => void cancelJob(job.id)} title="取消任务" type="button">
                            <XCircle size={17} />
                          </button>
                        ) : null}
                      </div>
                      <pre>{job.logs || job.error || "等待开始..."}</pre>
                      {job.error && job.logs ? <p className="zju-job-error">{job.error}</p> : null}
                    </div>
                  );
                })}
              </div>
            </DashboardCard>

            <DashboardCard className="tool-detail-card">
              <div className="zju-card-heading">
                <div className="card-title">
                  <KeyRound size={18} />
                  题目与答案
                </div>
                <ZjuStatusPill tone="muted">{subjects.length} 题</ZjuStatusPill>
              </div>
              <div className="zju-quiz-list">
                {subjects.length === 0 ? (
                  <p className="tool-empty">{selectedJob && ["queued", "running"].includes(selectedJob.status) ? "答案任务执行中..." : "选择互动后创建读取任务。"}</p>
                ) : null}
                {subjects.map((subject, index) => (
                  <div className="zju-quiz-item" key={subject.id || index} style={{ animationDelay: `${Math.min(index * 30, 320)}ms` }}>
                    <div className="zju-quiz-head">
                      <ZjuStatusPill tone="muted">{typeLabel[subject.type] ?? subject.type}</ZjuStatusPill>
                      <span className="zju-quiz-number">Q{index + 1}</span>
                      {subject.point ? <span className="zju-quiz-point">{subject.point} 分</span> : null}
                    </div>
                    <p className="zju-quiz-desc">{subject.description}</p>
                    {subject.options.length > 0 ? (
                      <div className="zju-quiz-options">
                        {subject.options.map((option) => (
                          <div className={`zju-quiz-option ${option.isAnswer ? "is-answer" : ""}`} key={option.label}>
                            <strong>{option.label}.</strong>
                            <span>{option.content}</span>
                            {option.isAnswer ? <CheckCircle2 size={15} /> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="zju-quiz-answers">
                      {subject.answers.length === 0 ? (
                        <span className="zju-quiz-answer-empty">未提供答案</span>
                      ) : (
                        subject.answers.map((answer, answerIndex) => (
                          <span className="zju-quiz-answer" key={`${answer.label}-${answerIndex}`}>
                            <CheckCircle2 size={14} />
                            {answer.label ? `${answer.label}. ` : ""}{answer.content}
                          </span>
                        ))
                      )}
                    </div>
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
