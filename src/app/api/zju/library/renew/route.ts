import { renewLibraryBooks } from "../../../../../lib/zju";
import { readJsonBody, requireValidZjuAccount, routeError, zjuJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;
  const body = await readJsonBody(request);
  const barcodes = Array.isArray(body.barcodes)
    ? body.barcodes.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

  if (barcodes.length === 0) {
    return zjuJson({ error: "invalid_request", message: "请选择要续借的图书。" }, { status: 400 });
  }

  try {
    const results = await renewLibraryBooks(user.userId, barcodes);
    return zjuJson({ results });
  } catch (error) {
    return routeError(error);
  }
}
