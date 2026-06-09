import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { Prisma } from "../generated/prisma/client";
import prisma from "./prisma";
import { auth } from "./auth";

export async function getCurrentSession() {
  return await auth.api.getSession({
    headers: await headers()
  });
}

export async function requireAdmin() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 })
    };
  }

  if (session.user.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    session
  };
}

export async function auditAdminAction(input: {
  action: string;
  actorId?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.adminAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? undefined
    }
  });
}
