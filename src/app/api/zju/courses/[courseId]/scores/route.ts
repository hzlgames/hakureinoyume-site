import { getCourseScores } from "../../../../../../lib/zju";
import { requireUser, routeError, zjuJson } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    courseId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const user = await requireUser();
  if (!user.ok) return user.response;
  const { courseId } = await context.params;

  try {
    const scores = await getCourseScores(user.userId, courseId);
    return zjuJson({ scores });
  } catch (error) {
    return routeError(error);
  }
}
