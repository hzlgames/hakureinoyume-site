import { getLiveApi } from "../../../../../lib/zju/live";
import { validLiveId } from "../../../../../lib/zju/live-core";
import { requireValidZjuAccount, routeError, zjuJson } from "../../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;
  const params = new URL(request.url).searchParams;
  const action = params.get("action") ?? "today";
  const courseId = params.get("courseId") ?? "";
  const subId = params.get("subId") ?? "";
  const refresh = params.get("refresh") === "1";
  if (!["today", "courses", "lessons", "streams"].includes(action) ||
    (action === "lessons" && !validLiveId(courseId)) ||
    (action === "streams" && (!validLiveId(subId) || (courseId !== "" && !validLiveId(courseId))))) {
    return zjuJson({ message: "请选择有效入口，并填写数字课程 ID 或课节 ID。" }, { status: 400 });
  }
  try {
    const api = await getLiveApi(user.userId);
    if (action === "courses") return zjuJson({ courses: await api.courses(refresh) });
    if (action === "lessons") return zjuJson({ lessons: await api.lessons(courseId, refresh) });
    if (action === "streams") return zjuJson({ streams: await api.streams(subId, courseId, params.get("type") ?? "") });
    return zjuJson({ lessons: await api.today(refresh) });
  } catch (error) { return routeError(error); }
}
