import { gradeOverview, saveGradeSettings, checkGrades, testGradeNotification } from "../../../../lib/zju/grades";
import { requireValidZjuAccount, readJsonBody, routeError, zjuJson } from "../_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try { return zjuJson(await gradeOverview(user.userId)); } catch (error) { return routeError(error); }
}
export async function PUT(request: Request) {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try { return zjuJson(await saveGradeSettings(user.userId, await readJsonBody(request))); } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
 const user = await requireValidZjuAccount(); if (!user.ok) return user.response;
 try {
  const body = await readJsonBody(request);
  if (body.action === "test-ding") { await testGradeNotification(user.userId); return zjuJson({ ok: true }); }
  return zjuJson(await checkGrades(user.userId));
 } catch (error) { return routeError(error); }
}
