import "dotenv/config";
import prisma from "../src/lib/prisma";
import { runSubtitleWorker, cleanupLiveSubtitles } from "../src/lib/zju/subtitle-worker";
const abort = new AbortController();
process.once("SIGINT", () => abort.abort()); process.once("SIGTERM", () => abort.abort());
async function main() {
  try { if (process.argv.includes("--cleanup-only")) await cleanupLiveSubtitles(); else await runSubtitleWorker(abort.signal); }
  finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error("Subtitle worker failed; check database and server ASR configuration."); process.exitCode = 1; });
