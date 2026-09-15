import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../prisma";
import { ARTIFACT_TTL_MS } from "./artifacts";
import { getZjuDataRoot, asRecord, toJsonValue } from "./shared";

export async function cleanupZjuArtifacts() {
  const root = path.resolve(getZjuDataRoot());
  const cutoff = new Date(Date.now() - ARTIFACT_TTL_MS);
  const jobs = await prisma.zjuToolJob.findMany({ where: { createdAt: { lte: cutoff }, workDir: { not: null } } });
  for (const job of jobs) {
    const dir = path.resolve(job.workDir!);
    const relative = path.relative(root, dir);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    await fs.rm(dir, { recursive: true, force: true });
    await prisma.zjuToolJob.update({ where: { id: job.id }, data: { workDir: null, output: toJsonValue({ ...asRecord(job.output), files: [], filesExpired: true }) } });
  }
  // Also collect orphaned directories left by deleted accounts or interrupted jobs.
  for (const user of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!user.isDirectory()) continue;
    const userDir = path.join(root, user.name);
    for (const entry of await fs.readdir(userDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(userDir, entry.name);
      if ((await fs.stat(dir)).mtimeMs <= cutoff.getTime()) await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return jobs.length;
}
