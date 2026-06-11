import { NextResponse } from "next/server";
import { getCurrentSession } from "../../../lib/admin";
import { getStoredZjuAccount } from "../../../lib/zju";

export function zjuJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function requireUser() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: zjuJson({
        error: "site_login_required",
        message: "请先登录本站账号。"
      }, { status: 401 })
    };
  }

  return {
    ok: true as const,
    userId: session.user.id
  };
}

export async function requireValidZjuAccount() {
  const user = await requireUser();
  if (!user.ok) return user;

  const account = await getStoredZjuAccount(user.userId);
  if (!account?.isValid) {
    return {
      ok: false as const,
      response: zjuJson({
        error: "zju_account_required",
        message: "请先在 ZJU 工具合集页保存并验证学号密码。"
      }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    userId: user.userId,
    account
  };
}

export async function readJsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function sanitizeZjuJobOutput(output: unknown) {
  const record = asRecord(output);
  const files = Array.isArray(record.files) ? record.files : null;

  if (!files) return output;

  return {
    ...record,
    files: files
      .map(asRecord)
      .filter((file) => typeof file.name === "string" && typeof file.size === "number")
      .map((file) => ({
        id: typeof file.id === "string" ? file.id : undefined,
        name: file.name,
        size: file.size
      }))
  };
}

export function serializeZjuJob<T extends Record<string, unknown>>(job: T) {
  const result = { ...job };
  delete result.workDir;

  return {
    ...result,
    output: sanitizeZjuJobOutput(job.output)
  };
}

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "请求处理失败。";
  return zjuJson({ error: "zju_error", message }, { status: 500 });
}
