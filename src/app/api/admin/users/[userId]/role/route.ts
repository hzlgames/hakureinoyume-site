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
  const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role;

  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      updatedAt: new Date()
    },
    select: {
      id: true,
      role: true
    }
  });

  await auditAdminAction({
    action: "user.role.update",
    actorId: admin.session.user.id,
    targetId: userId,
    metadata: { role }
  });

  return NextResponse.json({ user: updated });
}
