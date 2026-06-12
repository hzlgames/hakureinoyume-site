import { getLibraryLoans } from "../../../../../lib/zju";
import { requireValidZjuAccount, routeError, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;

  try {
    const loans = await getLibraryLoans(user.userId);
    return zjuJson({ loans });
  } catch (error) {
    return routeError(error);
  }
}
