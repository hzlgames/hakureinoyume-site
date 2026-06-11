import crypto from "crypto";
import type { Prisma } from "../generated/prisma/client";
import prisma from "./prisma";

type CoursesClient = import("login-zju").COURSES;
type LibClient = import("login-zju").APILIB;

export type ZjuTodo = {
  courseId?: number | string | null;
  courseName: string;
  dueAt: string | null;
  id: number | string;
  source: "courses.zju" | "pintia";
  title: string;
  type: string;
  url: string;
};

export type ZjuCourse = {
  id: number;
  name: string;
  code: string;
  status: string;
  instructors: string[];
};

export type ZjuMaterial = {
  activityId: number | string;
  activityTitle: string;
  createdAt: string | null;
  id: number | string;
  key: string | null;
  name: string;
  size: number;
};

export type ZjuActivityKind = "material" | "video" | "view";

export type ZjuActivity = {
  done: boolean;
  duration: number;
  id: number | string;
  kind: ZjuActivityKind;
  title: string;
  type: string;
};

export type ZjuClassroomCourse = {
  id: string;
  teacher: string;
  title: string;
};

export type ZjuClassroomVideo = {
  courseId: string;
  playbackUrl: string | null;
  startAt: number;
  subId: string;
  title: string;
};

export type ZjuLibraryLoan = {
  author: string;
  barcode: string;
  dueDate: string;
  loanDate: string;
  remainingDays: number | null;
  renewable: boolean;
  status: "borrowed" | "due-soon" | "overdue" | "unknown";
  title: string;
};

type StoredZjuSecret = {
  username: string;
  password: string;
  pintiaCookie: string | null;
};

type ActiveJob = {
  abort: AbortController;
  userId: string;
};

const activeJobs = new Map<string, ActiveJob>();

function getEncryptionKey() {
  const secret = process.env.ZJU_ACCOUNT_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error("ZJU_ACCOUNT_SECRET or BETTER_AUTH_SECRET is required.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

function decryptSecret(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function byteToSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Math.round(bytes / Math.pow(1024, index))} ${units[index]}`;
}

function buildCoursesClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ COURSES, ZJUAM }) => {
    return new COURSES(new ZJUAM(secret.username, secret.password));
  });
}

function buildClassroomClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ CLASSROOM, ZJUAM }) => {
    return new CLASSROOM(new ZJUAM(secret.username, secret.password));
  });
}

function buildLibClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ APILIB, ZJUAM }) => {
    return new APILIB(new ZJUAM(secret.username, secret.password));
  });
}

async function validateCoursesSecret(secret: StoredZjuSecret) {
  const attempts: Array<() => Promise<void>> = [
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch(
        "https://courses.zju.edu.cn/api/my-semesters?fields=id,name,sort,is_active,code"
      );
      if (!response.ok) throw new Error("semesters validation failed");
      await response.json();
    },
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch("https://courses.zju.edu.cn/api/my-courses", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          fields: "id,name,course_code,status",
          page: 1,
          page_size: 1,
          conditions: {
            status: ["ongoing", "notStarted", "closed"],
            keyword: "",
            classify_type: "recently_started",
            display_studio_list: false
          },
          showScorePassedStatus: false
        })
      });
      if (!response.ok) throw new Error("courses validation failed");
      await response.json();
    },
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch("https://courses.zju.edu.cn/user/index");
      if (!response.ok) throw new Error("index validation failed");
    }
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // Try the next authenticated endpoint; transient ZJU failures are common.
    }
  }

  throw new Error("ZJU 账号验证失败，请检查学号或密码后重试。");
}

async function requestJson<T>(client: CoursesClient, url: string, init?: RequestInit): Promise<T> {
  const response = await client.fetch(url, init);

  if (!response.ok) {
    throw new Error(`courses.zju request failed: ${response.status}`);
  }

  return await response.json() as T;
}

function expandActiveSemesterIds(semesters: Array<Record<string, unknown>>) {
  return [
    ...new Set(
      semesters
        .filter((semester) => Boolean(semester.is_active))
        .flatMap((semester) => {
          const id = readNumber(semester.id);
          return id === null ? [] : [id, id + 1, id + 2];
        })
    )
  ];
}

function materialFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "material";
}

function uniqueMaterialFileName(name: string, usedNames: Set<string>) {
  const safeName = materialFileName(name);
  const dotIndex = safeName.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < safeName.length - 1;
  const baseName = hasExtension ? safeName.slice(0, dotIndex) : safeName;
  const extension = hasExtension ? safeName.slice(dotIndex) : "";
  let candidate = safeName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}-${index}${extension}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function getZjuDataRoot() {
  return process.env.ZJU_TOOL_DATA_DIR ?? `${process.cwd()}/.data/zju-tools`;
}

function pathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
}

export async function getStoredZjuAccount(userId: string) {
  const account = await prisma.zjuAccount.findUnique({
    where: { userId }
  });

  if (!account) return null;

  return {
    id: account.id,
    username: account.username,
    hasPintiaCookie: Boolean(account.pintiaCiphertext),
    isValid: Boolean(account.lastValidatedAt),
    lastValidatedAt: account.lastValidatedAt,
    updatedAt: account.updatedAt
  };
}

export async function saveStoredZjuAccount(input: {
  clearPintiaCookie?: boolean;
  password?: string;
  pintiaCookie?: string;
  userId: string;
  username: string;
}) {
  const existing = await prisma.zjuAccount.findUnique({
    where: { userId: input.userId }
  });

  if (!existing && !input.password) {
    throw new Error("首次保存 ZJU 账号时密码不能为空。");
  }

  const currentSecret = existing
    ? await getZjuSecret(input.userId)
    : null;
  const nextSecret: StoredZjuSecret = {
    username: input.username,
    password: input.password || currentSecret?.password || "",
    pintiaCookie: input.clearPintiaCookie
      ? null
      : input.pintiaCookie?.trim()
        ? input.pintiaCookie.trim()
        : currentSecret?.pintiaCookie ?? null
  };

  await validateCoursesSecret(nextSecret);

  const password = input.password ? encryptSecret(input.password) : null;
  const pintiaCookie = input.clearPintiaCookie
    ? null
    : input.pintiaCookie?.trim()
      ? encryptSecret(input.pintiaCookie.trim())
      : undefined;
  const lastValidatedAt = new Date();

  if (existing) {
    await prisma.zjuAccount.update({
      where: { userId: input.userId },
      data: {
        username: input.username,
        lastValidatedAt,
        ...(password ? {
          passwordCiphertext: password.ciphertext,
          passwordIv: password.iv,
          passwordTag: password.tag
        } : {}),
        ...(pintiaCookie === undefined ? {} : {
          pintiaCiphertext: pintiaCookie?.ciphertext ?? null,
          pintiaIv: pintiaCookie?.iv ?? null,
          pintiaTag: pintiaCookie?.tag ?? null
        })
      }
    });
    return;
  }

  if (!password) {
    throw new Error("首次保存 ZJU 账号时密码不能为空。");
  }

  await prisma.zjuAccount.create({
    data: {
      userId: input.userId,
      username: input.username,
      passwordCiphertext: password.ciphertext,
      passwordIv: password.iv,
      passwordTag: password.tag,
      pintiaCiphertext: pintiaCookie?.ciphertext,
      pintiaIv: pintiaCookie?.iv,
      pintiaTag: pintiaCookie?.tag,
      lastValidatedAt
    }
  });
}

export async function deleteStoredZjuAccount(userId: string) {
  await prisma.zjuAccount.deleteMany({
    where: { userId }
  });
}

async function getZjuSecret(userId: string): Promise<StoredZjuSecret> {
  const account = await prisma.zjuAccount.findUnique({
    where: { userId }
  });

  if (!account) {
    throw new Error("请先保存 ZJU 学号和密码。");
  }

  const pintiaCookie = account.pintiaCiphertext && account.pintiaIv && account.pintiaTag
    ? decryptSecret({
      ciphertext: account.pintiaCiphertext,
      iv: account.pintiaIv,
      tag: account.pintiaTag
    })
    : null;

  return {
    username: account.username,
    password: decryptSecret({
      ciphertext: account.passwordCiphertext,
      iv: account.passwordIv,
      tag: account.passwordTag
    }),
    pintiaCookie
  };
}

export async function getMyCourses(userId: string): Promise<ZjuCourse[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const payload = await requestJson<{ courses?: Array<Record<string, unknown>> }>(
    client,
    "https://courses.zju.edu.cn/api/my-courses",
    {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({
        fields: "id,name,course_code,status,instructors(id,name,email)",
        page: 1,
        page_size: 1000,
        conditions: {
          status: ["ongoing", "notStarted", "closed"],
          keyword: "",
          classify_type: "recently_started",
          display_studio_list: false
        },
        showScorePassedStatus: false
      })
    }
  );

  return (payload.courses ?? []).map((course) => ({
    id: readNumber(course.id) ?? 0,
    name: readString(course.name) || "未命名课程",
    code: readString(course.course_code),
    status: readString(course.status),
    instructors: Array.isArray(course.instructors)
      ? course.instructors.map((item) => readString(asRecord(item).name)).filter(Boolean)
      : []
  })).filter((course) => course.id > 0);
}

export async function getReliableTodos(userId: string): Promise<ZjuTodo[]> {
  const secret = await getZjuSecret(userId);
  const client = await buildCoursesClient(secret);
  const semestersPayload = await requestJson<{ semesters?: Array<Record<string, unknown>> }>(
    client,
    "https://courses.zju.edu.cn/api/my-semesters?fields=id,name,sort,is_active,code"
  );
  const activeSemesterIds = expandActiveSemesterIds(semestersPayload.semesters ?? []);
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "1000");
  params.set("sort", "all");
  params.set("normal", "{\"version\":7,\"apiVersion\":\"1.1.0\"}");
  params.set("conditions", JSON.stringify({
    role: [],
    semester_id: activeSemesterIds,
    academic_year_id: [],
    status: ["ongoing", "notStarted"],
    course_type: [],
    effectiveness: [],
    published: [],
    display_studio_list: false
  }));
  params.set("fields", "id,name,course_code");

  const coursesPayload = await requestJson<{ courses?: Array<Record<string, unknown>> }>(
    client,
    `https://courses.zju.edu.cn/api/my-courses?${params.toString()}`
  );
  const uniqueCourses = [
    ...new Map((coursesPayload.courses ?? []).map((course) => [readNumber(course.id), course])).values()
  ].filter((course) => readNumber(course.id) !== null);

  const now = new Date();
  const todos: ZjuTodo[] = [];

  await Promise.all(uniqueCourses.map(async (course) => {
    const courseId = readNumber(course.id);
    if (courseId === null) return;
    const courseName = readString(course.name) || "未命名课程";
    const fallback = <T extends Record<string, unknown>>(value: T) => value;
    const [activitiesData, examsData, submissionsData, submittedExamsData, classroomsData] = await Promise.all([
      requestJson<{ activities?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/activities`).catch(() => fallback({ activities: [] })),
      requestJson<{ exams?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/exams`).catch(() => fallback({ exams: [] })),
      requestJson<{ homework_activities?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/course/${courseId}/homework/submission-status?no-intercept=true`).catch(() => fallback({ homework_activities: [] })),
      requestJson<{ exam_ids?: Array<number | string> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/submitted-exams?no-intercept=true`).catch(() => fallback({ exam_ids: [] })),
      requestJson<{ classrooms?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/classroom-list`).catch(() => fallback({ classrooms: [] }))
    ]);

    const submittedHomeworkIds = new Set(
      (submissionsData.homework_activities ?? [])
        .filter((item) => item.status_code === "submitted")
        .map((item) => readNumber(item.id) ?? readString(item.id))
    );
    const submittedExamIds = new Set(submittedExamsData.exam_ids ?? []);
    const isActive = (item: Record<string, unknown>) => {
      const endTime = readString(item.end_time);
      const startTime = readString(item.start_time);
      if (item.published === false) return false;
      if (!endTime || new Date(endTime) <= now) return false;
      if (startTime && new Date(startTime) > now) return false;
      return true;
    };

    for (const activity of activitiesData.activities ?? []) {
      const id = readNumber(activity.id) ?? readString(activity.id);
      if (!id || !isActive(activity)) continue;
      if (activity.type === "homework" && submittedHomeworkIds.has(id)) continue;
      if (activity.completion_criterion_key === "score" && Number(activity.score_percentage) >= 1) continue;
      todos.push({
        courseId,
        courseName,
        dueAt: readString(activity.end_time) || null,
        id,
        source: "courses.zju",
        title: readString(activity.title) || "未命名事项",
        type: readString(activity.type) || "activity",
        url: `https://courses.zju.edu.cn/course/${courseId}/learning-activity#/${id}`
      });
    }

    for (const exam of examsData.exams ?? []) {
      const id = readNumber(exam.id) ?? readString(exam.id);
      if (!id || !isActive(exam) || submittedExamIds.has(id)) continue;
      todos.push({
        courseId,
        courseName,
        dueAt: readString(exam.end_time) || null,
        id,
        source: "courses.zju",
        title: readString(exam.title) || "未命名测验",
        type: "quiz",
        url: `https://courses.zju.edu.cn/course/${courseId}/learning-activity#/${id}`
      });
    }

    for (const classroom of classroomsData.classrooms ?? []) {
      const id = readNumber(classroom.id) ?? readString(classroom.id);
      const endAt = readString(classroom.end_at);
      const startAt = readString(classroom.start_at);
      if (!id || classroom.status !== "start") continue;
      if (startAt && new Date(startAt) > now) continue;
      if (endAt && new Date(endAt) <= now) continue;
      todos.push({
        courseId,
        courseName,
        dueAt: endAt || null,
        id,
        source: "courses.zju",
        title: readString(classroom.title) || "课堂互动",
        type: "interaction",
        url: `https://courses.zju.edu.cn/course/${courseId}/content#/`
      });
    }
  }));

  const pintiaTodos = await getPintiaTodos(secret.pintiaCookie);
  return [...todos, ...pintiaTodos].sort((left, right) => {
    const leftTime = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightTime = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return leftTime - rightTime;
  });
}

async function getPintiaTodos(cookie: string | null): Promise<ZjuTodo[]> {
  if (!cookie) return [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const url = new URL("https://pintia.cn/api/problem-sets");
  url.searchParams.set("filter", JSON.stringify({ endAtAfter: yesterday.toISOString() }));
  url.searchParams.set("limit", "100");
  url.searchParams.set("order_by", "END_AT");
  url.searchParams.set("asc", "true");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json;charset=UTF-8",
      "Accept-Language": "zh-CN",
      Cookie: cookie,
      Referer: "https://pintia.cn/problem-sets/dashboard"
    },
    cache: "no-store"
  });
  if (!response.ok) return [];
  const payload = await response.json() as { problemSets?: Array<Record<string, unknown>> };
  const now = new Date();

  return (payload.problemSets ?? [])
    .filter((item) => readString(item.endAt) && new Date(readString(item.endAt)) > now)
    .map((item) => {
      const id = readString(item.id);
      return {
        courseId: null,
        courseName: readString(item.organizationName) || readString(item.ownerNickname) || "pintia",
        dueAt: readString(item.endAt) || null,
        id,
        source: "pintia" as const,
        title: readString(item.name) || "未命名作业",
        type: "problem-set",
        url: `https://pintia.cn/problem-sets/${id}/exam/problems`
      };
    });
}

export async function getCourseScores(userId: string, courseId: string) {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const [activityReadsData, homeworkScoresData, examScoresData, examsData] = await Promise.all([
    requestJson<{ activity_reads?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/course/${courseId}/activity-reads-for-user`),
    requestJson<{ homework_activities?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/course/${courseId}/homework-scores?fields=id,title`),
    requestJson<{ exam_scores?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/exam-scores?no-intercept=true`),
    requestJson<{ exams?: Array<Record<string, unknown>> }>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/exams`)
  ]);
  const homeworkMap = new Map((homeworkScoresData.homework_activities ?? []).map((item) => [readNumber(item.id), readString(item.title)]));
  const examsMap = new Map((examsData.exams ?? []).map((item) => [readNumber(item.id), readString(item.title)]));
  const rows: Array<{ id: number | string; score: string; title: string; type: "作业" | "考试" }> = [];

  for (const item of activityReadsData.activity_reads ?? []) {
    const id = readNumber(item.activity_id);
    if (id === null || !homeworkMap.has(id)) continue;
    const data = asRecord(item.data);
    rows.push({
      id,
      score: data.score === null || data.score === undefined ? "—" : String(data.score),
      title: homeworkMap.get(id) || `作业 ID ${id}`,
      type: "作业"
    });
  }

  for (const item of examScoresData.exam_scores ?? []) {
    const id = readNumber(item.activity_id);
    if (id === null || id === 0 || !examsMap.has(id)) continue;
    rows.push({
      id,
      score: item.score === null || item.score === undefined ? "—" : String(item.score),
      title: examsMap.get(id) || `考试 ID ${id}`,
      type: "考试"
    });
  }

  return rows.sort((left, right) => String(left.id).localeCompare(String(right.id), "zh-CN"));
}

export async function getCourseMaterials(userId: string, courseId: string): Promise<ZjuMaterial[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const payload = await requestJson<{ activities?: Array<Record<string, unknown>> }>(
    client,
    `https://courses.zju.edu.cn/api/courses/${courseId}/activities`
  );

  return (payload.activities ?? [])
    .filter((activity) => activity.type === "material")
    .flatMap((activity) => {
      const uploads = Array.isArray(activity.uploads) ? activity.uploads : [];
      return uploads.map((upload) => {
        const item = asRecord(upload);
        return {
          activityId: readNumber(activity.id) ?? readString(activity.id),
          activityTitle: readString(activity.title) || "课程资料",
          createdAt: readString(item.created_at) || null,
          id: readNumber(item.id) ?? readString(item.id),
          key: readString(item.key) || null,
          name: readString(item.name) || "未命名文件",
          size: readNumber(item.size) ?? 0
        };
      });
    });
}

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

// 单写者、整体覆盖式的日志写入，避免并行 worker 互相覆盖丢行。
function createJobLogger(jobId: string) {
  const lines: string[] = [];
  let dirty = false;
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    if (!dirty) return;
    dirty = false;
    await prisma.zjuToolJob
      .update({ where: { id: jobId }, data: { logs: `${lines.join("\n")}\n` } })
      .catch(() => undefined);
  };

  return {
    log(message: string) {
      lines.push(message);
      dirty = true;
      if (!scheduled) {
        scheduled = true;
        setTimeout(() => void flush(), 360);
      }
    },
    flush
  };
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

export async function createMaterialDownloadJob(input: {
  courseId: string;
  selectedIds?: Array<string | number>;
  userId: string;
}) {
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "courses.zju/materialDown",
      status: "queued",
      input: toJsonValue({
        courseId: input.courseId,
        selectedIds: input.selectedIds ?? []
      })
    }
  });

  void runMaterialDownloadJob(job.id, input.userId, input.courseId, input.selectedIds ?? []);
  return job;
}

async function appendJobLog(jobId: string, message: string) {
  const job = await prisma.zjuToolJob.findUnique({
    where: { id: jobId },
    select: { logs: true }
  });
  await prisma.zjuToolJob.update({
    where: { id: jobId },
    data: {
      logs: `${job?.logs ?? ""}${message}\n`
    }
  });
}

async function runMaterialDownloadJob(
  jobId: string,
  userId: string,
  courseId: string,
  selectedIds: Array<string | number>
) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const fs = await import("fs/promises");
  const workDir = `${getZjuDataRoot()}/${pathSegment(userId)}/${pathSegment(jobId)}`;

  try {
    await fs.mkdir(workDir, { recursive: true });
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: new Date(),
        workDir
      }
    });

    await appendJobLog(jobId, "正在读取课程资料列表。");
    const secret = await getZjuSecret(userId);
    const client = await buildCoursesClient(secret);
    const materials = await getCourseMaterials(userId, courseId);
    const selected = selectedIds.length > 0
      ? materials.filter((item) => selectedIds.map(String).includes(String(item.id)))
      : materials;
    const files: Array<{ id: string; name: string; path: string; size: number }> = [];
    const usedNames = new Set<string>();

    await appendJobLog(jobId, `准备下载 ${selected.length} 个文件，合计 ${byteToSize(selected.reduce((sum, item) => sum + item.size, 0))}。`);
    for (const material of selected) {
      if (abort.signal.aborted) throw new Error("任务已取消。");
      const fileName = uniqueMaterialFileName(material.name, usedNames);
      const targetPath = `${workDir}/${fileName}`;
      await appendJobLog(jobId, `下载中：${fileName}`);
      const response = await client.fetch(`https://courses.zju.edu.cn/api/uploads/${material.id}/blob`, {
        signal: abort.signal
      });

      if (!response.ok) {
        throw new Error(`下载失败：${fileName} (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(targetPath, buffer);
      files.push({
        id: String(material.id),
        name: fileName,
        path: targetPath,
        size: buffer.byteLength
      });
    }

    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        exitCode: 0,
        finishedAt: new Date(),
        output: toJsonValue({ files })
      }
    });
    await appendJobLog(jobId, "下载完成。");
  } catch (error) {
    const cancelled = abort.signal.aborted;
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: cancelled ? "cancelled" : "failed",
        exitCode: cancelled ? null : 1,
        error: error instanceof Error ? error.message : "任务执行失败。",
        finishedAt: new Date()
      }
    });
  } finally {
    activeJobs.delete(jobId);
  }
}

export async function cancelZjuJob(userId: string, jobId: string) {
  const job = await prisma.zjuToolJob.findFirst({
    where: { id: jobId, userId }
  });

  if (!job) return false;
  activeJobs.get(jobId)?.abort.abort();

  if (!["succeeded", "failed", "cancelled"].includes(job.status)) {
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        finishedAt: new Date()
      }
    });
  }

  return true;
}

// ===========================================================================
// 智云课堂（classroom.zju / CLASSROOM）—— 课程回放链接 + 课堂转录导出
// 移植自 zju_automation/ZJU-live-better classroom.zju/{getVideoURL,generateCourseMd}.js
// ===========================================================================
const CLASSROOM_COURSE_LIST =
  "https://education.cmc.zju.edu.cn/personal/courseapi/vlabpassportapi/v1/account-profile/course?nowpage=1&per-page=100&force_mycourse=1";

export async function getClassroomCourses(userId: string): Promise<ZjuClassroomCourse[]> {
  const client = await buildClassroomClient(await getZjuSecret(userId));
  const response = await client.fetch(CLASSROOM_COURSE_LIST);
  if (!response.ok) throw new Error("智云课堂课程读取失败。");
  const payload = await response.json() as { params?: { result?: { data?: Array<Record<string, unknown>> } } };
  const data = payload.params?.result?.data ?? [];
  return data.map((course) => ({
    id: String(readNumber(course.Id) ?? readString(course.Id)),
    title: readString(course.Title) || "未命名课程",
    teacher: readString(course.Teacher)
  })).filter((course) => course.id && course.id !== "null");
}

export async function getClassroomVideos(userId: string, courseId: string): Promise<ZjuClassroomVideo[]> {
  const client = await buildClassroomClient(await getZjuSecret(userId));
  const response = await client.fetch(`https://yjapi.cmc.zju.edu.cn/courseapi/v2/course/catalogue?course_id=${encodeURIComponent(courseId)}`);
  if (!response.ok) throw new Error("课堂视频读取失败。");
  const payload = await response.json() as { result?: { data?: Array<Record<string, unknown>> } };
  const list = payload.result?.data ?? [];

  return list
    .filter((video) => String(video.status) === "6")
    .sort((left, right) => Number(right.start_at) - Number(left.start_at))
    .map((video) => {
      let playbackUrl: string | null = null;
      try {
        const content = JSON.parse(readString(video.content));
        playbackUrl = typeof content?.playback?.url === "string" ? content.playback.url : null;
      } catch {
        playbackUrl = null;
      }
      return {
        subId: String(readNumber(video.sub_id) ?? readString(video.sub_id)),
        courseId: String(readNumber(video.course_id) ?? readString(video.course_id) ?? courseId),
        title: readString(video.title) || "未命名视频",
        startAt: readNumber(video.start_at) ?? 0,
        playbackUrl
      };
    });
}

export async function createTranscriptJob(input: {
  courseId: string;
  subId: string;
  title?: string;
  userId: string;
}) {
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "classroom.zju/transcript",
      status: "queued",
      input: toJsonValue({ courseId: input.courseId, subId: input.subId, title: input.title ?? "" })
    }
  });
  void runTranscriptJob(job.id, input.userId, input.courseId, input.subId, input.title ?? "");
  return job;
}

function transcriptTimeTag(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `- [${pad(minutes)}:${pad(secs)}]`;
}

async function runTranscriptJob(
  jobId: string,
  userId: string,
  courseId: string,
  subId: string,
  title: string
) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const fs = await import("fs/promises");
  const fsSync = await import("fs");
  const workDir = `${getZjuDataRoot()}/${pathSegment(userId)}/${pathSegment(jobId)}`;
  const logger = createJobLogger(jobId);

  try {
    await fs.mkdir(workDir, { recursive: true });
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), workDir }
    });

    logger.log(`导出课堂转录：${title || `course ${courseId} / sub ${subId}`}`);
    const client = await buildClassroomClient(await getZjuSecret(userId));

    // PPT 截图
    const pptResponse = await client.fetch(`https://classroom.zju.edu.cn/pptnote/v1/schedule/search-ppt?course_id=${encodeURIComponent(courseId)}&sub_id=${encodeURIComponent(subId)}`, { signal: abort.signal });
    if (!pptResponse.ok) throw new Error(`PPT 读取失败 ${pptResponse.status}`);
    const pptPayload = await pptResponse.json() as { list?: Array<Record<string, unknown>> };
    const pptData = (pptPayload.list ?? []).map((item) => {
      let content: Record<string, unknown> = {};
      try {
        content = typeof item.content === "string" ? JSON.parse(item.content) : asRecord(item.content);
      } catch {
        content = {};
      }
      return { pptimgurl: readString(content.pptimgurl), createdSec: readNumber(item.created_sec) ?? 0 };
    });
    logger.log(`获取 ${pptData.length} 张 PPT 截图。`);

    // 字幕转写
    const subtitleResponse = await client.fetch(`https://yjapi.cmc.zju.edu.cn/courseapi/v3/web-socket/search-trans-result?sub_id=${encodeURIComponent(subId)}&format=json`, { signal: abort.signal });
    if (!subtitleResponse.ok) throw new Error(`字幕读取失败 ${subtitleResponse.status}`);
    const subtitlePayload = await subtitleResponse.json() as { list?: Array<Record<string, unknown>> };
    const subtitleData: Array<{ beginSec: number; text: string }> = [];
    for (const item of subtitlePayload.list ?? []) {
      const allContent = Array.isArray(item.all_content) ? item.all_content : [];
      for (const entry of allContent) {
        const record = asRecord(entry);
        subtitleData.push({ beginSec: readNumber(record.BeginSec) ?? 0, text: readString(record.Text) });
      }
    }
    logger.log(`获取 ${subtitleData.length} 条字幕。`);

    if (!pptData.length && !subtitleData.length) {
      logger.log("该课堂没有可导出的 PPT 或字幕。");
      await logger.flush();
      await prisma.zjuToolJob.update({
        where: { id: jobId },
        data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue({ files: [] }) }
      });
      return;
    }

    const files: Array<{ name: string; path: string; size: number }> = [];
    const lines: Array<{ line: string; time: number }> = [];

    for (let index = 0; index < pptData.length; index += 1) {
      if (abort.signal.aborted) throw new Error("任务已取消。");
      const ppt = pptData[index];
      const fileName = `ppt_${String(index + 1).padStart(3, "0")}.png`;
      lines.push({ line: `- ![](${fileName})`, time: ppt.createdSec });
      if (!ppt.pptimgurl) continue;
      try {
        const imageResponse = await client.fetch(ppt.pptimgurl, { signal: abort.signal });
        if (!imageResponse.ok) continue;
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const targetPath = `${workDir}/${fileName}`;
        await fs.writeFile(targetPath, buffer);
        files.push({ name: fileName, path: targetPath, size: buffer.byteLength });
      } catch {
        // 单张图片失败不影响整体导出
      }
    }
    logger.log(`下载 ${files.length} 张 PPT 截图完成。`);

    for (const entry of subtitleData) {
      lines.push({ line: `${transcriptTimeTag(entry.beginSec)}${entry.text}`, time: entry.beginSec });
    }

    const markdown = lines.sort((left, right) => left.time - right.time).map((item) => item.line).join("\n");
    const mdName = `${materialFileName(title || `course_${courseId}_sub_${subId}`)}.md`;
    const mdPath = `${workDir}/${mdName}`;
    await fs.writeFile(mdPath, markdown, "utf-8");
    files.unshift({ name: mdName, path: mdPath, size: Buffer.byteLength(markdown, "utf-8") });
    void fsSync;

    logger.log("Markdown 转录文件生成完成。");
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue({ files }) }
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
  }
}

// ===========================================================================
// 图书馆（lib.zju / APILIB）—— 借阅查询与续借
// 移植自 zju_automation/ZJU-live-better lib.zju/bookList.js
// ===========================================================================
const LIBRARY_CODE = "ZJU50";

function libDateFormat(value: string) {
  if (!value) return "";
  if (value.length === 8) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function libDayDiff(value: string) {
  if (!value) return null;
  const formatted = libDateFormat(value);
  const target = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - midnight.getTime()) / (1000 * 60 * 60 * 24));
}

function libLoanStatus(dueDate: string): { renewable: boolean; status: ZjuLibraryLoan["status"] } {
  const diff = libDayDiff(dueDate);
  if (diff === null) return { status: "unknown", renewable: false };
  if (diff < 0) return { status: "overdue", renewable: false };
  if (diff <= 7) return { status: "due-soon", renewable: true };
  return { status: "borrowed", renewable: true };
}

function libCanRenew(item: Record<string, unknown>) {
  const z30 = asRecord(item.z30);
  const z36 = asRecord(item.z36);
  const { status } = libLoanStatus(readString(z36["z36-due-date"]));
  if (status === "overdue") return false;
  const letterNumber = readString(z36["z36-letter-number"]);
  if (letterNumber && Number(letterNumber) !== 0) return false;
  const itemStatus = readString(z30["z30-item-status"]);
  if (itemStatus === "12") return true;
  if (itemStatus === "11") return readString(z36["z36-no-renewal"]) === "0";
  return false;
}

async function libAuth(client: LibClient) {
  await client.fetch(`http://api.lib.zju.edu.cn/aleph/bor-auth?CON_LNG=chi`).catch(() => undefined);
  const borId = client.bor_id;
  if (!borId) throw new Error("图书馆登录失败，未获取到读者 ID。");
  return borId;
}

export async function getLibraryLoans(userId: string): Promise<ZjuLibraryLoan[]> {
  const client = await buildLibClient(await getZjuSecret(userId));
  const borId = await libAuth(client);
  const response = await client.fetch(`http://api.lib.zju.edu.cn/aleph/bor_info?bor_id=${borId}`);
  const payload = await response.json() as { data?: { "bor-info"?: Record<string, unknown> } };
  const borInfo = payload.data?.["bor-info"];
  if (!borInfo || borInfo.error) throw new Error("借阅信息读取失败。");

  const rawLoans = borInfo["item-l"];
  const loans = Array.isArray(rawLoans) ? rawLoans : rawLoans ? [rawLoans] : [];

  return loans.map((raw) => {
    const item = asRecord(raw);
    const z13 = asRecord(item.z13);
    const z30 = asRecord(item.z30);
    const z36 = asRecord(item.z36);
    const dueDate = readString(z36["z36-due-date"]);
    const { status, renewable } = libLoanStatus(dueDate);
    return {
      barcode: readString(z30["z30-barcode"]),
      title: readString(z13["z13-title"]) || "未知书名",
      author: readString(z13["z13-author"]),
      loanDate: libDateFormat(readString(z36["z36-loan-date"])),
      dueDate: libDateFormat(dueDate),
      remainingDays: libDayDiff(dueDate),
      renewable: renewable && libCanRenew(item),
      status
    };
  });
}

export async function renewLibraryBooks(userId: string, barcodes: string[]) {
  const client = await buildLibClient(await getZjuSecret(userId));
  const borId = await libAuth(client);
  const results: Array<{ barcode: string; ok: boolean }> = [];

  for (const barcode of barcodes) {
    if (!barcode) continue;
    try {
      const response = await client.fetch(`http://api.lib.zju.edu.cn/aleph/renew?CON_LNG=chi&bor-id=${borId}&library=${LIBRARY_CODE}&item_barcode=${encodeURIComponent(barcode)}`);
      const payload = await response.json() as { data?: { renew?: { reply?: string } } };
      results.push({ barcode, ok: payload.data?.renew?.reply === "ok" });
    } catch {
      results.push({ barcode, ok: false });
    }
  }

  return results;
}

// ===========================================================================
// WebPlus 通知存档（webplus.zju）—— 保存通知页面与全部附件（修正附件文件名）
// 移植自 zju_automation/ZJU-live-better webplus.zju/saveDoc.js（无 cheerio，改用定向正则）
// ===========================================================================
function stripHtmlTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseWebplusDoc(html: string, baseUrl: string) {
  const titleMatch = html.match(/<h1[^>]*class=["'][^"']*\barti_title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripHtmlTags(titleMatch[1]) || "无标题" : "无标题";

  const attachments: Array<{ fileName: string; url: string }> = [];
  const anchorRegex = /<a\b([^>]*\bsudyfile-attr\b[^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const innerText = stripHtmlTags(match[2]);
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch ? hrefMatch[2] : "";
    if (!href || href.startsWith("javascript:")) continue;

    let fileName = innerText;
    const attrMatch = attrs.match(/\bsudyfile-attr\s*=\s*(["'])(.*?)\1/i);
    if (attrMatch) {
      try {
        const parsed = JSON.parse(attrMatch[2].replace(/'/g, '"')) as { title?: string };
        if (parsed.title) fileName = parsed.title;
      } catch {
        // 解析失败时回退到链接文本
      }
    }

    let resolved = href;
    try {
      resolved = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    attachments.push({ url: resolved, fileName: materialFileName(fileName || "attachment") });
  }

  return { title, attachments };
}

export async function createWebplusArchiveJob(input: { url: string; userId: string }) {
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "webplus.zju/archive",
      status: "queued",
      input: toJsonValue({ url: input.url })
    }
  });
  void runWebplusArchiveJob(job.id, input.userId, input.url);
  return job;
}

async function runWebplusArchiveJob(jobId: string, userId: string, url: string) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const fs = await import("fs/promises");
  const workDir = `${getZjuDataRoot()}/${pathSegment(userId)}/${pathSegment(jobId)}`;
  const logger = createJobLogger(jobId);

  try {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new Error("无效的通知链接。");
    }
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("仅支持 http/https 链接。");
    }

    await fs.mkdir(workDir, { recursive: true });
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), workDir }
    });

    logger.log(`抓取通知页面：${target.href}`);
    const pageResponse = await fetch(target.href, { signal: abort.signal, cache: "no-store" });
    if (!pageResponse.ok) throw new Error(`页面抓取失败 ${pageResponse.status}`);
    const html = await pageResponse.text();
    const { title, attachments } = parseWebplusDoc(html, target.href);
    logger.log(`标题：${title}，发现 ${attachments.length} 个附件。`);

    const files: Array<{ name: string; path: string; size: number }> = [];
    const usedNames = new Set<string>();

    const htmlName = uniqueMaterialFileName(`${title}.html`, usedNames);
    const htmlPath = `${workDir}/${htmlName}`;
    await fs.writeFile(htmlPath, html, "utf-8");
    files.push({ name: htmlName, path: htmlPath, size: Buffer.byteLength(html, "utf-8") });

    for (const attachment of attachments) {
      if (abort.signal.aborted) throw new Error("任务已取消。");
      const fileName = uniqueMaterialFileName(attachment.fileName, usedNames);
      logger.log(`下载附件：${fileName}`);
      try {
        const response = await fetch(attachment.url, { signal: abort.signal });
        if (!response.ok) {
          logger.log(`  跳过（${response.status}）：${fileName}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const targetPath = `${workDir}/${fileName}`;
        await fs.writeFile(targetPath, buffer);
        files.push({ name: fileName, path: targetPath, size: buffer.byteLength });
      } catch (downloadError) {
        if (abort.signal.aborted) throw downloadError;
        logger.log(`  下载失败：${fileName}`);
      }
    }

    logger.log(`存档完成，共保存 ${files.length} 个文件。`);
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue({ files }) }
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
  }
}
