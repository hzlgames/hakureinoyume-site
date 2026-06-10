import { NextResponse } from "next/server";
import { getCurrentSession } from "../../../lib/admin";

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

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "请求处理失败。";
  return zjuJson({ error: "zju_error", message }, { status: 500 });
}
