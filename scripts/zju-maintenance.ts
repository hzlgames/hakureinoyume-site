import "dotenv/config";
import prisma from "../src/lib/prisma";
import { cleanupZjuArtifacts } from "../src/lib/zju/cleanup";
import { checkGrades } from "../src/lib/zju/grades";
import { asRecord } from "../src/lib/zju/shared";

async function main() {
try {
  await cleanupZjuArtifacts();
  if (!process.argv.includes("--cleanup-only")) {
    const settings = await prisma.zjuToolState.findMany({ where: { key: "grade-settings" } });
    for (const item of settings) {
      if (!asRecord(item.value).enabled) continue;
      try { await checkGrades(item.userId, true); }
      catch { console.error("A scheduled grade check failed; details saved in the user's grade state."); }
    }
  }
} finally { await prisma.$disconnect(); }

}
void main().catch(() => { console.error("ZJU maintenance failed."); process.exitCode = 1; });
