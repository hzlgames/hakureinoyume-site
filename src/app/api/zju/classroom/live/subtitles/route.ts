import { requireValidZjuAccount, zjuJson } from "../../../_shared";
import { heartbeatLiveSubtitles, joinLiveSubtitles, leaveLiveSubtitles, readLiveSubtitles, validSubtitleClient } from "../../../../../../lib/zju/subtitles";
import { lessonKey } from "../../../../../../lib/zju/subtitle-core";
import { requireAdmin } from "../../../../../../lib/admin";
import prisma from "../../../../../../lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function identity(params: URLSearchParams) { const value = { courseId: params.get("courseId") ?? "", subId: params.get("subId") ?? "" }; lessonKey(value); return value; }
function json(data: unknown, status = 200) { const response = zjuJson(data, { status }); response.headers.set("Cache-Control", "private, no-store"); return response; }
export async function GET(request: Request) {
  const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
  try {
    const params = new URL(request.url).searchParams, raw = params.get("after");
    const after = raw === null ? -1 : Number(raw);
    if (!Number.isSafeInteger(after) || after < -1) return json({ message: "字幕游标无效。" }, 400);
    return json({ subtitle: await readLiveSubtitles(user.userId, identity(params), after) });
  } catch { return json({ message: "无法读取此课节字幕，请检查课程访问权限。" }, 403); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(process.env.BETTER_AUTH_URL || request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ message: "请求来源无效。" }, 403);
  const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
  try {
    if (!request.headers.get("content-type")?.includes("application/json") || Number(request.headers.get("content-length") || 0) > 4096) return json({ message: "字幕请求格式无效。" }, 400);
    if (!request.body) return json({ message: "字幕请求不能为空。" }, 400);
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > 4096) return json({ message: "字幕请求过大。" }, 400); chunks.push(next.value); } }
    finally { await reader.cancel().catch(() => {}); }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")); const clientId = input?.clientId;
    if (!validSubtitleClient(clientId)) return json({ message: "字幕客户端标识无效。" }, 400);
    const lesson = identity(new URLSearchParams({ courseId: String(input.courseId ?? ""), subId: String(input.subId ?? "") }));
    if (input.action === "stop") {
      const admin = await requireAdmin(); if (!admin.ok) return admin.response;
      await prisma.zjuLiveSubtitle.updateMany({ where: { lessonKey: lessonKey(lesson), status: { in: ["queued", "running", "idle", "failed"] } }, data: { status: "stopped", leaseOwner: null, leaseUntil: null, finishedAt: new Date(), partial: "", partialStartMs: null, partialEndMs: null, error: "管理员已停止识别。" } });
      return json({ ok: true });
    }
    if (input.action === "join") return json(await joinLiveSubtitles(user.userId, lesson, clientId));
    if (input.action === "heartbeat") { await heartbeatLiveSubtitles(user.userId, lesson, clientId); return json({ ok: true }); }
    if (input.action === "leave") { await leaveLiveSubtitles(user.userId, lesson, clientId); return json({ ok: true }); }
    return json({ message: "字幕操作无效。" }, 400);
  } catch (error) { return json({ message: error instanceof Error && !/Prisma|database|\n/i.test(error.message) ? error.message : "字幕服务暂不可用。" }, 400); }
}
