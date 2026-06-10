import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type { Prisma } from "../generated/prisma/client";
import prisma from "./prisma";

type CoursesClient = import("login-zju").COURSES;

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

async function requestJson<T>(client: CoursesClient, url: string, init?: RequestInit): Promise<T> {
  const response = await client.fetch(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`courses.zju request failed: ${response.status} ${body}`);
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

function getZjuDataRoot() {
  return process.env.ZJU_TOOL_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "zju-tools");
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
    lastValidatedAt: account.lastValidatedAt,
    updatedAt: account.updatedAt
  };
}

export async function saveStoredZjuAccount(input: {
  password: string;
  pintiaCookie?: string | null;
  userId: string;
  username: string;
}) {
  const password = encryptSecret(input.password);
  const pintiaCookie = input.pintiaCookie?.trim()
    ? encryptSecret(input.pintiaCookie.trim())
    : null;

  return await prisma.zjuAccount.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      username: input.username,
      passwordCiphertext: password.ciphertext,
      passwordIv: password.iv,
      passwordTag: password.tag,
      pintiaCiphertext: pintiaCookie?.ciphertext,
      pintiaIv: pintiaCookie?.iv,
      pintiaTag: pintiaCookie?.tag
    },
    update: {
      username: input.username,
      passwordCiphertext: password.ciphertext,
      passwordIv: password.iv,
      passwordTag: password.tag,
      pintiaCiphertext: pintiaCookie?.ciphertext,
      pintiaIv: pintiaCookie?.iv,
      pintiaTag: pintiaCookie?.tag
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
  const workDir = path.join(getZjuDataRoot(), userId, jobId);

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

    await appendJobLog(jobId, `准备下载 ${selected.length} 个文件，合计 ${byteToSize(selected.reduce((sum, item) => sum + item.size, 0))}。`);
    for (const material of selected) {
      if (abort.signal.aborted) throw new Error("任务已取消。");
      const fileName = materialFileName(material.name);
      const targetPath = path.join(workDir, fileName);
      await appendJobLog(jobId, `下载中：${fileName}`);
      const response = await client.fetch(`https://courses.zju.edu.cn/api/uploads/${material.id}/blob`, {
        signal: abort.signal
      });

      if (!response.ok) {
        throw new Error(`下载失败：${fileName} (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
      files.push({
        id: String(material.id),
        name: fileName,
        path: targetPath,
        size: Buffer.byteLength(Buffer.from(arrayBuffer))
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
