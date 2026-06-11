import prisma from "../../../../lib/prisma";
import { createAutoplayJob, createMaterialDownloadJob, createTranscriptJob, createWebplusArchiveJob } from "../../../../lib/zju";
import { readJsonBody, requireValidZjuAccount, routeError, serializeZjuJob, zjuJson } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;

  try {
    const jobs = await prisma.zjuToolJob.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return zjuJson({ jobs: jobs.map(serializeZjuJob) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;
  const body = await readJsonBody(request);
  const tool = typeof body.tool === "string" ? body.tool : "";
  const courseId = typeof body.courseId === "string" || typeof body.courseId === "number"
    ? String(body.courseId)
    : "";
  const selectedIds = Array.isArray(body.selectedIds)
    ? body.selectedIds.filter((item) => typeof item === "string" || typeof item === "number")
    : [];

  try {
    if (tool === "classroom.zju/transcript") {
      const subId = typeof body.subId === "string" || typeof body.subId === "number" ? String(body.subId) : "";
      const title = typeof body.title === "string" ? body.title : "";
      if (!courseId || !subId) {
        return zjuJson({ error: "invalid_job", message: "缺少课堂信息。" }, { status: 400 });
      }
      const job = await createTranscriptJob({ userId: user.userId, courseId, subId, title });
      return zjuJson({ job: serializeZjuJob(job) }, { status: 201 });
    }

    if (tool === "webplus.zju/archive") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!url) {
        return zjuJson({ error: "invalid_job", message: "请填写通知链接。" }, { status: 400 });
      }
      const job = await createWebplusArchiveJob({ userId: user.userId, url });
      return zjuJson({ job: serializeZjuJob(job) }, { status: 201 });
    }

    if (!courseId) {
      return zjuJson({ error: "invalid_job", message: "缺少课程信息。" }, { status: 400 });
    }

    if (tool === "courses.zju/autoplay") {
      const speed = typeof body.speed === "number" ? body.speed : Number(body.speed) || 4;
      const concurrency = typeof body.concurrency === "number" ? body.concurrency : Number(body.concurrency) || 0;
      const force = body.force === true;
      const job = await createAutoplayJob({
        userId: user.userId,
        courseId,
        speed,
        concurrency,
        force,
        selectedIds
      });
      return zjuJson({ job: serializeZjuJob(job) }, { status: 201 });
    }

    if (tool === "courses.zju/materialDown") {
      const job = await createMaterialDownloadJob({
        userId: user.userId,
        courseId,
        selectedIds
      });
      return zjuJson({ job: serializeZjuJob(job) }, { status: 201 });
    }

    return zjuJson({
      error: "invalid_job",
      message: "不支持的任务类型。"
    }, { status: 400 });
  } catch (error) {
    return routeError(error);
  }
}
