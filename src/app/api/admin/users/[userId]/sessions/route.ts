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

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const { userId } = await params;
  const result = await prisma.session.deleteMany({ where: { userId } });

  await auditAdminAction({
    action: "user.sessions.revoke",
    actorId: admin.session.user.id,
    targetId: userId,
    metadata: { count: result.count }
  });

  return NextResponse.json({ revoked: result.count });
}
