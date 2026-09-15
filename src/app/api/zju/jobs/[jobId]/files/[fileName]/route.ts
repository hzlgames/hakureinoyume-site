import { artifactsExpired } from "../../../../../../../lib/zju/artifacts";
import fs from "fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "path";
import prisma from "../../../../../../../lib/prisma";
import { requireValidZjuAccount, routeError, zjuJson } from "../../../../_shared";

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

function isInsideDirectory(childPath: string, parentPath: string) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export async function GET(_request: Request, context: Context) {
  const user = await requireValidZjuAccount();
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

    if (artifactsExpired(job.createdAt)) return zjuJson({ error: "expired", message: "文件已到期清理，请重新创建下载任务。" }, { status: 410 });
    const output = asRecord(job.output);
    const files = Array.isArray(output.files) ? output.files : [];
    const file = files
      .map(asRecord)
      .find((item) => typeof item.name === "string" && item.name === fileName);

    if (
      !file
      || typeof file.path !== "string"
      || !job.workDir
      || path.basename(file.path) !== fileName
      || !isInsideDirectory(file.path, job.workDir)
    ) {
      return zjuJson({ error: "not_found", message: "文件不存在。" }, { status: 404 });
    }

    const stat = await fs.stat(file.path);
    const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size)
      }
    });
  } catch (error) {
    return routeError(error);
  }
}
