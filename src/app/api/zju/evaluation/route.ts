import { getEvaluationCourses, createEvaluationJob } from "../../../../lib/zju/evaluation";
import { requireValidZjuAccount, readJsonBody, routeError, zjuJson, serializeZjuJob } from "../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try { return zjuJson({ courses: await getEvaluationCourses(user.userId) }); } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try {
  const body = await readJsonBody(request);
  if (body.confirmed !== true || !Array.isArray(body.selections)) return zjuJson({ message: "请确认所选教师将提交满分评价。" }, { status: 400 });
  const selections = body.selections.filter((x) => x && typeof x.courseId === "string" && Array.isArray(x.teacherIds)).map((x) => ({ courseId: x.courseId as string, teacherIds: x.teacherIds.filter((id: unknown) => typeof id === "string") as string[] }));
  return zjuJson({ job: serializeZjuJob(await createEvaluationJob(user.userId, selections)) }, { status: 201 });
 } catch (error) { return routeError(error); }
}
