import { buildClassroomTranscript } from "./classroom-export";
// 智云课堂（classroom.zju）：录播回放链接与 PPT+字幕转录导出任务。
import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { activeJobs, createJobLogger } from "./jobs";
import { getReplayUrl } from "./live-core";
import {
  buildClassroomClient, getZjuDataRoot,
  pathSegment, readNumber, readString, toJsonValue
} from "./shared";
import type { ZjuClassroomCourse, ZjuClassroomVideo } from "./types";

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
      const playbackUrl = getReplayUrl(video.content);
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
  const workDir = `${getZjuDataRoot()}/${pathSegment(userId)}/${pathSegment(jobId)}`;
  const logger = createJobLogger(jobId);

  try {
    await fs.mkdir(workDir, { recursive: true });
    const started = await prisma.zjuToolJob.updateMany({
      where: { id: jobId, status: "queued" },
      data: { status: "running", startedAt: new Date(), workDir }
    });
    if (!started.count) return;
    abort.signal.throwIfAborted();

    logger.log(`导出课堂转录：${title || `course ${courseId} / sub ${subId}`}`);
    const client = await buildClassroomClient(await getZjuSecret(userId));

    abort.signal.throwIfAborted();
    const output = await buildClassroomTranscript({ client, courseId, subId, title, workDir, signal: abort.signal, log: message => logger.log(message) });
    await logger.flush();
    await prisma.zjuToolJob.updateMany({
      where: { id: jobId, status: "running" },
      data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue(output) }
    });
  } catch (error) {
    const cancelled = abort.signal.aborted;
    logger.log(cancelled ? "任务已取消。" : `任务失败：${error instanceof Error ? error.message : "未知错误"}`);
    await logger.flush();
    await prisma.zjuToolJob.updateMany({
      where: { id: jobId, status: "running" },
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
