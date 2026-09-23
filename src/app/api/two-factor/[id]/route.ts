import prisma from "../../../../lib/prisma";
import { otpError, otpJson, readOtpBody, requireOtpUser } from "../_shared";

import { normalizeEntry, OtpInputError } from "../../../../lib/two-factor/core";
import { decryptEntry, encryptEntry } from "../../../../lib/two-factor/crypto";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOtpUser(request);
    if (!user.ok) return user.response;
    const { id } = await context.params;
    const result = await prisma.twoFactorAccount.deleteMany({ where: { id, userId: user.userId } });
    return result.count ? otpJson({ deleted: true }) : otpJson({ message: "账号不存在或已删除。" }, 404);
  } catch (error) { return otpError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOtpUser(request);
    if (!user.ok) return user.response;
    const { id } = await context.params;
    const body = await readOtpBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new OtpInputError("编辑内容无效。");
    const input = body as Record<string, unknown>;
    if (typeof input.label !== "string" || typeof input.issuer !== "string" || Object.keys(input).some(key => key !== "label" && key !== "issuer")) {
      throw new OtpInputError("仅支持修改账号名称和服务商。");
    }
    const row = await prisma.twoFactorAccount.findFirst({ where: { id, userId: user.userId } });
    if (!row) return otpJson({ message: "账号不存在或已删除。" }, 404);
    const entry = normalizeEntry({ ...decryptEntry(row), label: input.label, issuer: input.issuer });
    const result = await prisma.twoFactorAccount.updateMany({
      where: { id, userId: user.userId },
      data: encryptEntry(entry, user.userId, id)
    });
    if (!result.count) return otpJson({ message: "账号不存在或已删除。" }, 404);
    return otpJson({ id, label: entry.label, issuer: entry.issuer });
  } catch (error) { return otpError(error); }
}
