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
  const pintiaCookie = typeof body.pintiaCookie === "string" ? body.pintiaCookie : null;

  if (!username || !password) {
    return zjuJson({
      error: "invalid_account",
      message: "学号和密码不能为空。"
    }, { status: 400 });
  }

  try {
    await saveStoredZjuAccount({
      userId: user.userId,
      username,
      password,
      pintiaCookie
    });
    const account = await getStoredZjuAccount(user.userId);
    return zjuJson({ account });
  } catch (error) {
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
