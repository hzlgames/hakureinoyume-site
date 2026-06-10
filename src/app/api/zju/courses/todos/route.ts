import { getReliableTodos } from "../../../../../lib/zju";
import { requireUser, routeError, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  try {
    const todos = await getReliableTodos(user.userId);
    return zjuJson({ todos });
  } catch (error) {
    return routeError(error);
  }
}
