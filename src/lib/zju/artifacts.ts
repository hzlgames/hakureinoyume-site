import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";

// Leave an hour of margin for the independent cleanup timer: files never need
// to be retained for the full two-day maximum advertised in the UI.
export const ARTIFACT_TTL_MS = 47 * 60 * 60 * 1000;
export type Artifact = { name: string; path: string; size: number; id?: string };
export function artifactExpiresAt(createdAt: Date | string) {
  return new Date(new Date(createdAt).getTime() + ARTIFACT_TTL_MS);
}
export function artifactsExpired(createdAt: Date | string, now = Date.now()) {
  return artifactExpiresAt(createdAt).getTime() <= now;
}
export async function packageArtifacts(workDir: string, files: Artifact[], name = "课程资料.zip") {
  const bundle = files.length > 5 || (files.length > 1 && files.some((file) => /\.md$/i.test(file.name)));
  if (!bundle) return { files, fileCount: files.length };
  let archiveName = name;
  while (files.some((file) => file.name === archiveName)) archiveName = `_${archiveName}`;
  const target = path.join(workDir, archiveName);
  const zip = new ZipFile();
  const writing = pipeline(zip.outputStream, createWriteStream(target));
  zip.on("error", (error) => (zip.outputStream as Readable).destroy(error));
  for (const file of files) zip.addFile(file.path, file.name);
  zip.end();
  await writing;
  const archive = { name: archiveName, path: target, size: (await fs.stat(target)).size };
  return { files: [archive], fileCount: files.length, bundled: true };
}
