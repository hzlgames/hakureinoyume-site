import { getCourseMaterials } from "../../../../../../lib/zju";
import { requireValidZjuAccount, routeError, zjuJson } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    courseId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;
  const { courseId } = await context.params;

  try {
    const materials = await getCourseMaterials(user.userId, courseId);
    return zjuJson({ materials });
  } catch (error) {
    return routeError(error);
  }
}
