import prisma from "../../../../../lib/prisma";
import { cancelZjuJob } from "../../../../../lib/zju";
import { requireUser, routeError, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  const { jobId } = await context.params;

  try {
    const job = await prisma.zjuToolJob.findFirst({
      where: {
        id: jobId,
        userId: user.userId
      }
    });

    if (!job) {
      return zjuJson({ error: "not_found", message: "任务不存在。" }, { status: 404 });
    }

    return zjuJson({ job });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  const { jobId } = await context.params;

  try {
    const ok = await cancelZjuJob(user.userId, jobId);
    if (!ok) {
      return zjuJson({ error: "not_found", message: "任务不存在。" }, { status: 404 });
    }
    return zjuJson({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
