import prisma from "../../../../lib/prisma";
import { createMaterialDownloadJob } from "../../../../lib/zju";
import { readJsonBody, requireUser, routeError, zjuJson } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  try {
    const jobs = await prisma.zjuToolJob.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return zjuJson({ jobs });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  const body = await readJsonBody(request);
  const tool = typeof body.tool === "string" ? body.tool : "";
  const courseId = typeof body.courseId === "string" || typeof body.courseId === "number"
    ? String(body.courseId)
    : "";
  const selectedIds = Array.isArray(body.selectedIds)
    ? body.selectedIds.filter((item) => typeof item === "string" || typeof item === "number")
    : [];

  if (tool !== "courses.zju/materialDown" || !courseId) {
    return zjuJson({
      error: "invalid_job",
      message: "暂时只支持课程资料下载任务。"
    }, { status: 400 });
  }

  try {
    const job = await createMaterialDownloadJob({
      userId: user.userId,
      courseId,
      selectedIds
    });
    return zjuJson({ job }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
