import prisma from "../prisma";
import { asRecord, toJsonValue } from "./shared";

export async function readToolState(userId: string, key: string) {
  return asRecord((await prisma.zjuToolState.findUnique({ where: { userId_key: { userId, key } } }))?.value);
}
export async function writeToolState(userId: string, key: string, value: unknown) {
  return prisma.zjuToolState.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value: toJsonValue(value) },
    update: { value: toJsonValue(value) }
  });
}
export async function withToolLock<T>(userId: string, key: string, action: () => Promise<T>): Promise<T> {
  await prisma.zjuToolState.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value: {} }, update: {} });
  let lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  const lock = await prisma.zjuToolState.updateMany({
    where: { userId, key, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
    data: { lockedUntil }
  });
  if (!lock.count) throw new Error("该工具正在处理，请稍后重试。");
  const heartbeat = setInterval(() => {
    const next = new Date(Date.now() + 30 * 60 * 1000);
    void prisma.zjuToolState.updateMany({ where: { userId, key, lockedUntil }, data: { lockedUntil: next } }).then((result) => { if (result.count) lockedUntil = next; }).catch(() => undefined);
  }, 60000);
  try { return await action(); }
  finally {
    clearInterval(heartbeat);
    await prisma.zjuToolState.updateMany({ where: { userId, key, lockedUntil }, data: { lockedUntil: null } });
  }
}
