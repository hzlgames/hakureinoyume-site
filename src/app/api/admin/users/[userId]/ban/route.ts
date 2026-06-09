import { NextResponse } from "next/server";
import prisma from "../../../../../../lib/prisma";
import { auditAdminAction, requireAdmin } from "../../../../../../lib/admin";

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

  if (userId === admin.session.user.id) {
    return NextResponse.json({ error: "cannot_ban_self" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    banned?: unknown;
    reason?: unknown;
  } | null;
  const banned = Boolean(body?.banned);
  const reason = typeof body?.reason === "string" && body.reason.trim()
    ? body.reason.trim()
    : "管理员停用";

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        banned,
        banReason: banned ? reason : null,
        banExpires: null,
        updatedAt: new Date()
      },
      select: {
        id: true,
        banned: true,
        banReason: true
      }
    }),
    ...(banned ? [prisma.session.deleteMany({ where: { userId } })] : [])
  ]);

  await auditAdminAction({
    action: banned ? "user.ban" : "user.unban",
    actorId: admin.session.user.id,
    targetId: userId,
    metadata: banned ? { reason } : undefined
  });

  return NextResponse.json({ user: updated });
}
