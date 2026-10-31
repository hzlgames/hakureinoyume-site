import fs from "node:fs/promises";
import { packageArtifacts, type Artifact } from "./artifacts";
import { asRecord, materialFileName, readNumber, readString } from "./shared";

export type TranscriptEntry = { beginSec: number; text: string };
export type ClassroomExportOptions = {
  client: { fetch: (url: string, options?: { signal?: AbortSignal }) => Promise<Response> };
  courseId: string; subId: string; title: string; workDir: string;
  signal: AbortSignal; log: (message: string) => void;
  // An explicit empty list also replaces school captions; never mix both sources.
  subtitles?: TranscriptEntry[];
  textFiles?: Record<string, string>;
};
function timeTag(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `- [${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}]`;
}
// Both sources use this same PPT + timestamped Markdown + ZIP export pipeline.
export async function buildClassroomTranscript(options: ClassroomExportOptions) {
  const { client, courseId, subId, title, workDir, signal, log } = options;
  signal.throwIfAborted();
  await fs.mkdir(workDir, { recursive: true });
  const pptResponse = await client.fetch(`https://classroom.zju.edu.cn/pptnote/v1/schedule/search-ppt?course_id=${encodeURIComponent(courseId)}&sub_id=${encodeURIComponent(subId)}`, { signal });
  if (!pptResponse.ok) throw new Error(`PPT 读取失败 ${pptResponse.status}`);
  const pptPayload = await pptResponse.json() as { list?: Array<Record<string, unknown>> };
  const pptData = (pptPayload.list ?? []).map(item => {
    let content: Record<string, unknown> = {};
    try { content = typeof item.content === "string" ? JSON.parse(item.content) : asRecord(item.content); } catch { /* Ignore malformed metadata. */ }
    return { url: readString(content.pptimgurl), time: readNumber(item.created_sec) ?? 0 };
  });
  log(`获取 ${pptData.length} 张 PPT 截图。`);
  let subtitles = options.subtitles;
  if (subtitles === undefined) {
    const response = await client.fetch(`https://yjapi.cmc.zju.edu.cn/courseapi/v3/web-socket/search-trans-result?sub_id=${encodeURIComponent(subId)}&format=json`, { signal });
    if (!response.ok) throw new Error(`字幕读取失败 ${response.status}`);
    const payload = await response.json() as { list?: Array<Record<string, unknown>> };
    subtitles = (payload.list ?? []).flatMap(item => (Array.isArray(item.all_content) ? item.all_content : []).map(entry => {
      const record = asRecord(entry);
      return { beginSec: readNumber(record.BeginSec) ?? 0, text: readString(record.Text) };
    }));
  }
  log(`使用 ${options.subtitles === undefined ? "智云" : "火山引擎"}字幕 ${subtitles.length} 条。`);
  if (!pptData.length && !subtitles.length && !Object.keys(options.textFiles ?? {}).length) return { files: [], fileCount: 0 };
  const files: Artifact[] = [], lines: { line: string; time: number }[] = [];
  for (const [index, ppt] of pptData.entries()) {
    signal.throwIfAborted();
    const name = `ppt_${String(index + 1).padStart(3,"0")}.png`;
    lines.push({ line: `- ![](${name})`, time: ppt.time });
    if (!ppt.url) continue;
    try {
      const response = await client.fetch(ppt.url, { signal });
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      signal.throwIfAborted();
      const path = `${workDir}/${name}`;
      await fs.writeFile(path, buffer);
      files.push({ name, path, size: buffer.length });
    } catch { signal.throwIfAborted(); /* A missing image does not fail the entire export. */ }
  }
  log(`下载 ${files.length} 张 PPT 截图完成。`);
  for (const entry of subtitles) lines.push({ line: `${timeTag(entry.beginSec)}${entry.text}`, time: entry.beginSec });
  const name = `${materialFileName(title || `course_${courseId}_sub_${subId}`)}.md`;
  const markdown = lines.sort((a,b) => a.time-b.time).map(item => item.line).join("\n");
  signal.throwIfAborted();
  await fs.writeFile(`${workDir}/${name}`, markdown, "utf8");
  files.unshift({ name, path: `${workDir}/${name}`, size: Buffer.byteLength(markdown) });
  for (const [name, text] of Object.entries(options.textFiles ?? {})) {
    signal.throwIfAborted();
    await fs.writeFile(`${workDir}/${name}`, text, "utf8");
    files.push({ name, path: `${workDir}/${name}`, size: Buffer.byteLength(text) });
  }
  signal.throwIfAborted();
  const packaged = await packageArtifacts(workDir, files, `${materialFileName(title || "课堂转录")}.zip`);
  signal.throwIfAborted();
  log("PPT 与字幕 Markdown 转录导出完成。");
  return packaged;
}
