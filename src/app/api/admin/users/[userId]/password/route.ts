import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auditAdminAction, requireAdmin } from "../../../../../../lib/admin";
import { auth } from "../../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
  } | null;

  if (typeof body?.password !== "string" || body.password.length < 8 || body.password.length > 128) {
    return NextResponse.json({ error: "invalid_password" }, { status: 400 });
  }

  await auth.api.setUserPassword({
    body: {
      userId,
      newPassword: body.password
    },
    headers: await headers()
  });

  await auditAdminAction({
    action: "user.password.reset",
    actorId: admin.session.user.id,
    targetId: userId
  });

  return NextResponse.json({ ok: true });
}
