import { readToolState, writeToolState, withToolLock } from "../../../../../../lib/zju/state";
import { requireValidZjuAccount, readJsonBody, routeError, zjuJson } from "../../../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ courseId: string }> };
export async function GET(_request: Request, context: Context) {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try {
  const { courseId } = await context.params;
  const state = await readToolState(user.userId, `materials:${courseId}`);
  return zjuJson({ xid: courseId, cache: Array.isArray(state.cache) ? state.cache : [] });
 } catch (error) { return routeError(error); }
}
export async function PUT(request: Request, context: Context) {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try {
  const { courseId } = await context.params;
  const body = await readJsonBody(request);
  const cache = Array.isArray(body.cache) ? body.cache : [];
  if (cache.length > 10000 || cache.some((item) => !item || !["string", "number"].includes(typeof item.id))) throw new Error("无效的资料缓存配置。");
  await withToolLock(user.userId, `materials:${courseId}`, () => writeToolState(user.userId, `materials:${courseId}`, { xid: courseId, cache }));
  return zjuJson({ ok: true });
 } catch (error) { return routeError(error); }
}
