import fs from "fs/promises";
import path from "path";
import prisma from "../../../../../../../lib/prisma";
import { requireUser, routeError, zjuJson } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    fileName: string;
    jobId: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export async function GET(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  const { fileName, jobId } = await context.params;

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

    const output = asRecord(job.output);
    const files = Array.isArray(output.files) ? output.files : [];
    const file = files
      .map(asRecord)
      .find((item) => typeof item.name === "string" && item.name === fileName);

    if (!file || typeof file.path !== "string" || path.basename(file.path) !== fileName) {
      return zjuJson({ error: "not_found", message: "文件不存在。" }, { status: 404 });
    }

    const data = await fs.readFile(file.path);
    return new Response(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": "application/octet-stream"
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
