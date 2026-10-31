import prisma from "../../../../../lib/prisma";
import { cancelZjuJob } from "../../../../../lib/zju";
import { requireValidZjuAccount, routeError, serializeZjuJob, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const user = await requireValidZjuAccount();
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

    return zjuJson({ job: serializeZjuJob(job) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL || request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return zjuJson({ message: "请求来源无效。" }, { status: 403 });
  const user = await requireValidZjuAccount();
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
