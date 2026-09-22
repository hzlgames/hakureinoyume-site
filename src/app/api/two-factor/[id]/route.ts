import prisma from "../../../../lib/prisma";
import { otpError, otpJson, requireOtpUser } from "../_shared";

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
