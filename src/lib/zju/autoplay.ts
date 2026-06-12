// 学在浙大自动刷课（watchVideo）：拟真倍速分段上报观看进度的后端任务。
import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { activeJobs, createJobLogger } from "./jobs";
import { asRecord, buildCoursesClient, readNumber, readString, requestJson, toJsonValue } from "./shared";
import type { CoursesClient } from "./shared";
import type { ZjuActivity } from "./types";

// ---------------------------------------------------------------------------
// 自动播放（拟真倍速刷课）—— 移植自 zju_automation/course_autoplay/autoplay-paced.mjs
// 纯请求上报，不在浏览器播放：POST /api/course/activities-read/{activityId}
//   online_video: body {start,end}，按 ≤120s 分段覆盖全片
//   page / web_link: 空 body POST 一次
//   material: 每个 upload POST {upload_id}
// ---------------------------------------------------------------------------
const COURSES_BASE = "https://courses.zju.edu.cn";
const AUTOPLAY_CHUNK_SECONDS = 120; // 单段时长，后端上限 125s

type AutoplayPlan =
  | { kind: "video"; duration: number; segments: Array<{ end: number; start: number }> }
  | { kind: "view" }
  | { kind: "material"; uploads: Array<{ id: number | string }> };

function autoplayVideoDuration(activity: Record<string, unknown>) {
  const uploads = Array.isArray(activity.uploads) ? activity.uploads : [];
  const videos = Array.isArray(asRecord(uploads[0]).videos) ? (asRecord(uploads[0]).videos as unknown[]) : [];
  return Math.ceil(readNumber(asRecord(videos[0]).duration) ?? 0);
}

function buildAutoplayPlan(activity: Record<string, unknown>): AutoplayPlan | null {
  const type = readString(activity.type);
  const criterion = readString(activity.completion_criterion_key);

  if (type === "online_video" && ["completeness", "none", ""].includes(criterion)) {
    const duration = autoplayVideoDuration(activity);
    if (duration <= 0) return null;
    const segments: Array<{ end: number; start: number }> = [];
    for (let start = 0; start < duration; start += AUTOPLAY_CHUNK_SECONDS) {
      segments.push({ start, end: Math.min(duration, start + AUTOPLAY_CHUNK_SECONDS) });
    }
    return { kind: "video", duration, segments };
  }

  if (["web_link", "page"].includes(type) && ["view", "none", ""].includes(criterion)) {
    return { kind: "view" };
  }

  if (type === "material" && ["view", "none", ""].includes(criterion)) {
    const uploads = Array.isArray(activity.uploads) ? activity.uploads : [];
    const ids = uploads
      .map((upload) => readNumber(asRecord(upload).id) ?? readString(asRecord(upload).id))
      .filter((id): id is number | string => id !== "" && id !== null);
    return ids.length ? { kind: "material", uploads: ids.map((id) => ({ id })) } : null;
  }

  return null;
}

async function fetchCompletedActivityIds(client: CoursesClient, courseId: string) {
  const ids = new Set<number>();
  const [completeness, reads] = await Promise.allSettled([
    requestJson<{ completed_result?: { completed?: Record<string, unknown> } }>(client, `${COURSES_BASE}/api/course/${courseId}/my-completeness`),
    requestJson<{ activity_reads?: Array<Record<string, unknown>> }>(client, `${COURSES_BASE}/api/course/${courseId}/activity-reads-for-user`)
  ]);

  if (completeness.status === "fulfilled") {
    const completed = asRecord(completeness.value?.completed_result?.completed);
    for (const key of ["learning_activity", "exam_activity"]) {
      const list = Array.isArray(completed[key]) ? completed[key] as unknown[] : [];
      for (const id of list) {
        const value = readNumber(id);
        if (value !== null) ids.add(value);
      }
    }
  }

  if (reads.status === "fulfilled") {
    for (const read of reads.value?.activity_reads ?? []) {
      if (readString(read.completeness) === "full") {
        const value = readNumber(read.activity_id);
        if (value !== null) ids.add(value);
      }
    }
  }

  return ids;
}

export async function getCourseActivities(userId: string, courseId: string): Promise<ZjuActivity[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const [payload, completedIds] = await Promise.all([
    requestJson<{ activities?: Array<Record<string, unknown>> }>(client, `${COURSES_BASE}/api/courses/${courseId}/activities?sub_course_id=0`),
    fetchCompletedActivityIds(client, courseId)
  ]);

  const result: ZjuActivity[] = [];
  for (const activity of payload.activities ?? []) {
    const plan = buildAutoplayPlan(activity);
    if (!plan) continue;
    const id = readNumber(activity.id) ?? readString(activity.id);
    const numericId = readNumber(activity.id);
    result.push({
      id,
      title: readString(activity.title) || "未命名活动",
      type: readString(activity.type) || "activity",
      kind: plan.kind,
      duration: plan.kind === "video" ? plan.duration : 0,
      done: numericId !== null && completedIds.has(numericId)
    });
  }
  return result;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function jitter(ms: number) {
  return Math.round(ms * (0.88 + Math.random() * 0.24));
}

function abortableSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("任务已取消。"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("任务已取消。"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (hours ? `${hours}:` : "") + `${pad(minutes)}:${pad(secs)}`;
}


type AutoplayTask = {
  id: number | string;
  plan: AutoplayPlan;
  tag: string;
  title: string;
};

async function postActivityRead(
  client: CoursesClient,
  activityId: number | string,
  body: Record<string, unknown> | null,
  signal: AbortSignal
) {
  const response = await client.fetch(`${COURSES_BASE}/api/course/activities-read/${activityId}`, {
    method: "POST",
    signal,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`上报失败 ${response.status}: ${text.slice(0, 160)}`);
  }
}

export async function createAutoplayJob(input: {
  concurrency: number;
  courseId: string;
  force: boolean;
  selectedIds?: Array<string | number>;
  speed: number;
  userId: string;
}) {
  const speed = Number.isFinite(input.speed) && input.speed > 0 ? Math.min(input.speed, 16) : 4;
  const concurrency = Number.isFinite(input.concurrency) && input.concurrency >= 0 ? input.concurrency : 0;
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "courses.zju/autoplay",
      status: "queued",
      input: toJsonValue({
        courseId: input.courseId,
        speed,
        concurrency,
        force: input.force,
        selectedIds: input.selectedIds ?? []
      })
    }
  });

  void runAutoplayJob(job.id, input.userId, {
    courseId: input.courseId,
    speed,
    concurrency,
    force: input.force,
    selectedIds: input.selectedIds ?? []
  });
  return job;
}

async function runAutoplayJob(
  jobId: string,
  userId: string,
  options: {
    concurrency: number;
    courseId: string;
    force: boolean;
    selectedIds: Array<string | number>;
    speed: number;
  }
) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const logger = createJobLogger(jobId);

  try {
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date() }
    });

    const client = await buildCoursesClient(await getZjuSecret(userId));
    // 串行预热登录，避免并发请求破坏 SSO 会话。
    await client.fetch(`${COURSES_BASE}/user/index`).catch(() => undefined);

    logger.log(`课程 ${options.courseId} · ${options.speed}x · ${options.concurrency === 1 ? "串行拟真" : "并行加速"}${options.force ? " · 强制重刷" : ""}`);

    const [payload, completedIds] = await Promise.all([
      requestJson<{ activities?: Array<Record<string, unknown>> }>(client, `${COURSES_BASE}/api/courses/${options.courseId}/activities?sub_course_id=0`),
      fetchCompletedActivityIds(client, options.courseId)
    ]);
    const activities = payload.activities ?? [];
    const selected = new Set(options.selectedIds.map(String));

    const tasks: AutoplayTask[] = [];
    let skipped = 0;
    for (const activity of activities) {
      const id = readNumber(activity.id) ?? readString(activity.id);
      if (selected.size > 0 && !selected.has(String(id))) continue;
      const numericId = readNumber(activity.id);
      if (!options.force && numericId !== null && completedIds.has(numericId)) {
        skipped += 1;
        continue;
      }
      const plan = buildAutoplayPlan(activity);
      if (!plan) continue;
      tasks.push({ id, plan, title: readString(activity.title) || "未命名活动", tag: "" });
    }
    tasks.forEach((task, index) => {
      task.tag = `#${index + 1}/${tasks.length} ${task.title.slice(0, 18)}`;
    });

    const videoTasks = tasks.filter((task) => task.plan.kind === "video");
    const longest = videoTasks.reduce((max, task) => Math.max(max, task.plan.kind === "video" ? task.plan.duration : 0), 0);
    const sumDuration = videoTasks.reduce((sum, task) => sum + (task.plan.kind === "video" ? task.plan.duration : 0), 0);
    const eta = (options.concurrency === 1 ? sumDuration : longest) / options.speed;

    logger.log(`共 ${activities.length} 个活动，待处理 ${tasks.length} 个（视频 ${videoTasks.length}），已完成跳过 ${skipped} 个。`);
    if (videoTasks.length) {
      logger.log(`视频总时长 ${formatClock(sumDuration)}，预计拟真耗时约 ${formatClock(eta)}。`);
    }

    if (!tasks.length) {
      logger.log("没有需要处理的活动。");
      await logger.flush();
      await prisma.zjuToolJob.update({
        where: { id: jobId },
        data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue({ summary: { ok: 0, fail: 0, skipped, before: completedIds.size, after: completedIds.size } }) }
      });
      return;
    }

    const startedAt = Date.now();
    const runVideo = async (task: AutoplayTask) => {
      if (task.plan.kind !== "video") return;
      await abortableSleep(jitter(Math.random() * 1500), abort.signal); // 错开起跑
      const segments = task.plan.segments;
      for (let index = 0; index < segments.length; index += 1) {
        const { start, end } = segments[index];
        await abortableSleep(jitter(((end - start) / options.speed) * 1000), abort.signal);
        await postActivityRead(client, task.id, { start, end }, abort.signal);
        logger.log(`[${task.tag}] 段 ${index + 1}/${segments.length} [${start}-${end}s] ✓ (t=+${formatClock((Date.now() - startedAt) / 1000)})`);
      }
      logger.log(`[${task.tag}] 完成（${formatClock(task.plan.duration)} 内容）`);
    };
    const runView = async (task: AutoplayTask) => {
      await postActivityRead(client, task.id, null, abort.signal);
      logger.log(`[${task.tag}] 浏览上报 ✓`);
    };
    const runMaterial = async (task: AutoplayTask) => {
      if (task.plan.kind !== "material") return;
      for (const upload of task.plan.uploads) {
        await postActivityRead(client, task.id, { upload_id: upload.id }, abort.signal);
      }
      logger.log(`[${task.tag}] 资料上报 ✓（${task.plan.uploads.length} 个附件）`);
    };
    const runTask = async (task: AutoplayTask) => {
      if (task.plan.kind === "video") return runVideo(task);
      if (task.plan.kind === "view") return runView(task);
      return runMaterial(task);
    };

    const limit = options.concurrency > 0 ? Math.min(options.concurrency, tasks.length) : tasks.length;
    const results = new Array<{ ok: boolean; reason?: string }>(tasks.length);
    let cursor = 0;
    const workers = Array.from({ length: limit }, async () => {
      while (cursor < tasks.length) {
        if (abort.signal.aborted) throw new Error("任务已取消。");
        const current = cursor;
        cursor += 1;
        try {
          await runTask(tasks[current]);
          results[current] = { ok: true };
        } catch (taskError) {
          if (abort.signal.aborted) throw taskError;
          const reason = taskError instanceof Error ? taskError.message : "未知错误";
          results[current] = { ok: false, reason };
          logger.log(`[${tasks[current].tag}] ✗ ${reason}`);
        }
      }
    });
    await Promise.all(workers);

    const ok = results.filter((result) => result?.ok).length;
    const fail = results.filter((result) => result && !result.ok).length;
    const after = await fetchCompletedActivityIds(client, options.courseId).catch(() => completedIds);

    logger.log(`完成：成功 ${ok} 个，失败 ${fail} 个，跳过 ${skipped} 个，实际耗时 ${formatClock((Date.now() - startedAt) / 1000)}。`);
    logger.log(`复核：当前已完成活动数 ${after.size}（之前 ${completedIds.size}）。`);
    await logger.flush();

    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: fail > 0 && ok === 0 ? "failed" : "succeeded",
        exitCode: fail > 0 && ok === 0 ? 1 : 0,
        error: fail > 0 ? `${fail} 个活动上报失败。` : null,
        finishedAt: new Date(),
        output: toJsonValue({ summary: { ok, fail, skipped, before: completedIds.size, after: after.size } })
      }
    });
  } catch (error) {
    const cancelled = abort.signal.aborted;
    logger.log(cancelled ? "任务已取消。" : `任务失败：${error instanceof Error ? error.message : "未知错误"}`);
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: cancelled ? "cancelled" : "failed",
        exitCode: cancelled ? null : 1,
        error: cancelled ? null : error instanceof Error ? error.message : "任务执行失败。",
        finishedAt: new Date()
      }
    });
  } finally {
    activeJobs.delete(jobId);
    await sleep(0);
  }
}
