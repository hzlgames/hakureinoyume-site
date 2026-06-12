import { getQuizAnswers } from "../../../../../../../lib/zju";
import { requireValidZjuAccount, routeError, zjuJson } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    classroomId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const user = await requireValidZjuAccount();
  if (!user.ok) return user.response;
  const { classroomId } = await context.params;

  try {
    const subjects = await getQuizAnswers(user.userId, classroomId);
    return zjuJson({ subjects });
  } catch (error) {
    return routeError(error);
  }
}
