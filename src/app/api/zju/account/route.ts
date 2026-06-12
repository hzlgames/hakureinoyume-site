import {
  deleteStoredZjuAccount,
  getStoredZjuAccount,
  saveStoredZjuAccount
} from "../../../../lib/zju";
import { readJsonBody, requireUser, routeError, zjuJson } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  try {
    const account = await getStoredZjuAccount(user.userId);
    return zjuJson({ account });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user.ok) return user.response;

  const body = await readJsonBody(request);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const pintiaCookie = typeof body.pintiaCookie === "string" ? body.pintiaCookie : undefined;
  const clearPintiaCookie = body.clearPintiaCookie === true;

  if (!username) {
    return zjuJson({
      error: "invalid_account",
      message: "学号不能为空。"
    }, { status: 400 });
  }

  try {
    const existing = await getStoredZjuAccount(user.userId);
    if (!existing && !password) {
      return zjuJson({
        error: "invalid_account",
        message: "首次保存 ZJU 账号时密码不能为空。"
      }, { status: 400 });
    }

    await saveStoredZjuAccount({
      userId: user.userId,
      username,
      password,
      pintiaCookie,
      clearPintiaCookie
    });
    const account = await getStoredZjuAccount(user.userId);
    return zjuJson({ account });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ZJU 账号验证失败")) {
      return zjuJson({
        error: "invalid_account",
        message: error.message
      }, { status: 400 });
    }

    return routeError(error);
  }
}

export async function DELETE() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  try {
    await deleteStoredZjuAccount(user.userId);
    return zjuJson({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
