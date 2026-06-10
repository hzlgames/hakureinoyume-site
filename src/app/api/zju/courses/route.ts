import { getMyCourses } from "../../../../lib/zju";
import { requireUser, routeError, zjuJson } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user.ok) return user.response;

  try {
    const courses = await getMyCourses(user.userId);
    return zjuJson({ courses });
  } catch (error) {
    return routeError(error);
  }
}
