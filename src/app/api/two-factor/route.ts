import { randomUUID } from "node:crypto";
import prisma from "../../../lib/prisma";
import { normalizeEntry, OtpInputError } from "../../../lib/two-factor/core";
import { decryptEntry, encryptEntry, entryFingerprint } from "../../../lib/two-factor/crypto";
import { otpError, otpJson, readOtpBody, requireOtpUser } from "./_shared";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireOtpUser(request);
    if (!user.ok) return user.response;
    const rows = await prisma.twoFactorAccount.findMany({ where: { userId: user.userId }, orderBy: { createdAt: "asc" } });
    return otpJson({ entries: rows.map(row => ({ ...decryptEntry(row), id: row.id })), serverTime: Date.now() });
  } catch (error) { return otpError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireOtpUser(request);
    if (!user.ok) return user.response;
    const body = await readOtpBody(request) as { entries?: unknown[] } | null;
    if (!Array.isArray(body?.entries) || !body.entries.length || body.entries.length > 500) throw new OtpInputError("每次须导入 1–500 个账号。");
    const entries = body.entries.map(normalizeEntry);
    const data = entries.map(entry => {
      const id = randomUUID();
      return { id, userId: user.userId, fingerprint: entryFingerprint(entry, user.userId), ...encryptEntry(entry, user.userId, id) };
    });
    const added = await prisma.$transaction(async tx => {
      // Serialize imports per user so parallel requests cannot exceed the vault limit.
      await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${user.userId} FOR UPDATE`;
      const existing = await tx.twoFactorAccount.findMany({ where: { userId: user.userId }, select: { fingerprint: true } });
      const seen = new Set(existing.map(row => row.fingerprint));
      const fresh = data.filter(row => { if (seen.has(row.fingerprint)) return false; seen.add(row.fingerprint); return true; });
      if (existing.length + fresh.length > 500) throw new OtpInputError("每个用户最多保存 500 个账号，请先删除不再使用的账号。");
      if (!fresh.length) return 0;
      return (await tx.twoFactorAccount.createMany({ data: fresh, skipDuplicates: true })).count;
    });
    return otpJson({ added, skipped: entries.length - added }, 201);
  } catch (error) { return otpError(error); }
}
