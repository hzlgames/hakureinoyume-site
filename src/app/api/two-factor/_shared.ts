import { NextResponse } from "next/server";
import { getCurrentSession } from "../../../lib/admin";
import { OtpInputError } from "../../../lib/two-factor/core";

export function otpJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function requireOtpUser(request: Request) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowed = new URL(process.env.BETTER_AUTH_URL || request.url).origin;
    if (!origin || origin !== allowed || request.headers.get("sec-fetch-site") === "cross-site") {
      return { ok: false as const, response: otpJson({ message: "请求来源无效，请刷新本站页面重试。" }, 403) };
    }
  }
  const session = await getCurrentSession();
  if (!session?.user?.id) return { ok: false as const, response: otpJson({ message: "请先登录本站账号。" }, 401) };
  return { ok: true as const, userId: session.user.id };
}
export async function readOtpBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new OtpInputError("请求格式应为 JSON。");
  const reader = request.body?.getReader();
  if (!reader) throw new OtpInputError("请求内容为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) { await reader.cancel(); throw new OtpInputError("导入内容过大。"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof OtpInputError) throw error;
    throw new OtpInputError("请求内容无效。");
  } finally { reader.releaseLock(); }
}
export function otpError(error: unknown) {
  // Never include parser input, database errors or credential material in responses/logs.
  return error instanceof OtpInputError
    ? otpJson({ message: error.message }, 400)
    : otpJson({ message: "无法读取或保存验证器数据，请稍后重试或联系管理员检查存储配置。" }, 500);
}
