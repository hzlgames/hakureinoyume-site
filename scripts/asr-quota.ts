// Explicit server operation; an account cannot grant itself a quota exemption.
import "dotenv/config";
import prisma from "../src/lib/prisma";
async function main() {
  const args = process.argv.slice(2), id = args.find(a=>a.startsWith("--user-id="))?.slice(10), name = args.find(a=>a.startsWith("--name="))?.slice(7);
  if ((!id && !name) || args.filter(a=>["--unlimited","--limited"].includes(a)).length !== 1) throw new Error("Usage: npm run asr:quota -- --user-id=ID --unlimited (or --name=EXACT_UNIQUE_NAME --limited)");
  const users = await prisma.user.findMany({ where: id ? { id } : { name }, select: { id: true } });
  if (users.length !== 1) throw new Error("账户必须唯一匹配；未修改任何配额。");
  await prisma.user.update({ where: { id: users[0].id }, data: { asrQuotaExempt: args.includes("--unlimited") } });
  console.log(args.includes("--unlimited") ? "该账户的直播与回放 ASR 配额已设为无限；共享并发和资源限制仍生效。" : "该账户已恢复共享 ASR 配额。");
}
void main().catch(()=>{console.error("ASR 配额设置失败，请检查参数、迁移和账户唯一性。");process.exitCode=1}).finally(()=>prisma.$disconnect());
