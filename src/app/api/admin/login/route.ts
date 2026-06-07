import { NextResponse } from "next/server";
import { createAdminSession, verifyAccessToken } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
  } | null;

  if (!verifyAccessToken(body?.token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  await createAdminSession();

  return NextResponse.json({ ok: true });
}
