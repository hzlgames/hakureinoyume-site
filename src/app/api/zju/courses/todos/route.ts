import { getReliableTodos } from "../../../../../lib/zju";
import { requireValidZjuAccount, routeError, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;

  try {
    const todos = await getReliableTodos(user.userId);
    return zjuJson({ todos });
  } catch (error) {
    return routeError(error);
  }
}
