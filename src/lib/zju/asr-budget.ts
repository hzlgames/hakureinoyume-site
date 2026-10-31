import type { Prisma } from "../../generated/prisma/client";
export const ASR_QUEUE_LOCK = 876012034;
export const ASR_BUDGET_LOCK = 876012035;
export function asrConcurrency() { return Math.min(8, Math.max(1, Number(process.env.ZJU_SUBTITLE_MAX_CONCURRENT) || 2)); }
export class AsrBudgetError extends Error { constructor() { super("今日直播与回放共用的识别预算已用完。"); this.name = "AsrBudgetError"; } }
export async function reserveAsrBudget(tx: Prisma.TransactionClient, audioMs: number, exempt: boolean, now = new Date()) {
  if (!Number.isSafeInteger(audioMs) || audioMs <= 0) throw new Error("音频时长无效。");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ASR_BUDGET_LOCK})`;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  const used = await tx.zjuLiveSubtitleDailyUsage.upsert({ where: { day }, create: { day }, update: {} });
  const maximum = Math.min(14400, Math.max(1, Number(process.env.ZJU_SUBTITLE_DAILY_MINUTES) || 120)) * 60000;
  if (!exempt && used.audioMs + audioMs > maximum) throw new AsrBudgetError();
  // Exempt usage is still audited, but does not deplete everyone else's shared pool.
  await tx.zjuLiveSubtitleDailyUsage.update({ where: { day }, data: exempt ? { exemptAudioMs: { increment: audioMs } } : { audioMs: { increment: audioMs } } });
}
