import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { requireAdmin } from "../../../../lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export async function GET(request: Request) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const { searchParams } = new URL(request.url);
  const page = parsePage(searchParams.get("page"));
  const pageSize = 12;
  const search = (searchParams.get("search") ?? "").trim();
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } }
        ]
      }
    : undefined;

  const [total, users, auditLogs] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        banned: true,
        banReason: true,
        banExpires: true,
        _count: {
          select: {
            sessions: true
          }
        }
      }
    }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        actor: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })
  ]);

  return NextResponse.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    users,
    auditLogs
  });
}
