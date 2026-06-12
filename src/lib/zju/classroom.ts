// 智云课堂（classroom.zju）：录播回放链接与 PPT+字幕转录导出任务。
import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { activeJobs, createJobLogger } from "./jobs";
import {
  asRecord, buildClassroomClient, getZjuDataRoot, materialFileName,
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
