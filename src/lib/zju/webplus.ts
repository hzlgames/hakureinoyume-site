// WebPlus（webplus.zju）：通知页面与全部附件存档任务（定向正则解析）。
import prisma from "../prisma";
import { activeJobs, createJobLogger } from "./jobs";
import {
  getZjuDataRoot, materialFileName, pathSegment, stripHtmlTags, toJsonValue, uniqueMaterialFileName
} from "./shared";

function parseWebplusDoc(html: string, baseUrl: string) {
  const titleMatch = html.match(/<h1[^>]*class=["'][^"']*\barti_title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripHtmlTags(titleMatch[1]) || "无标题" : "无标题";

  const attachments: Array<{ fileName: string; url: string }> = [];
  const anchorRegex = /<a\b([^>]*\bsudyfile-attr\b[^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const innerText = stripHtmlTags(match[2]);
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch ? hrefMatch[2] : "";
    if (!href || href.startsWith("javascript:")) continue;

    let fileName = innerText;
    const attrMatch = attrs.match(/\bsudyfile-attr\s*=\s*(["'])(.*?)\1/i);
    if (attrMatch) {
      try {
        const parsed = JSON.parse(attrMatch[2].replace(/'/g, '"')) as { title?: string };
        if (parsed.title) fileName = parsed.title;
      } catch {
        // 解析失败时回退到链接文本
      }
    }

    let resolved = href;
    try {
      resolved = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    attachments.push({ url: resolved, fileName: materialFileName(fileName || "attachment") });
  }

  return { title, attachments };
}

export async function createWebplusArchiveJob(input: { url: string; userId: string }) {
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "webplus.zju/archive",
      status: "queued",
      input: toJsonValue({ url: input.url })
    }
  });
  void runWebplusArchiveJob(job.id, input.userId, input.url);
  return job;
}

async function runWebplusArchiveJob(jobId: string, userId: string, url: string) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const fs = await import("fs/promises");
  const workDir = `${getZjuDataRoot()}/${pathSegment(userId)}/${pathSegment(jobId)}`;
  const logger = createJobLogger(jobId);

  try {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new Error("无效的通知链接。");
    }
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("仅支持 http/https 链接。");
    }

    await fs.mkdir(workDir, { recursive: true });
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), workDir }
    });

    logger.log(`抓取通知页面：${target.href}`);
    const pageResponse = await fetch(target.href, { signal: abort.signal, cache: "no-store" });
    if (!pageResponse.ok) throw new Error(`页面抓取失败 ${pageResponse.status}`);
    const html = await pageResponse.text();
    const { title, attachments } = parseWebplusDoc(html, target.href);
    logger.log(`标题：${title}，发现 ${attachments.length} 个附件。`);

    const files: Array<{ name: string; path: string; size: number }> = [];
    const usedNames = new Set<string>();

    const htmlName = uniqueMaterialFileName(`${title}.html`, usedNames);
    const htmlPath = `${workDir}/${htmlName}`;
    await fs.writeFile(htmlPath, html, "utf-8");
    files.push({ name: htmlName, path: htmlPath, size: Buffer.byteLength(html, "utf-8") });

    for (const attachment of attachments) {
      if (abort.signal.aborted) throw new Error("任务已取消。");
      const fileName = uniqueMaterialFileName(attachment.fileName, usedNames);
      logger.log(`下载附件：${fileName}`);
      try {
        const response = await fetch(attachment.url, { signal: abort.signal });
        if (!response.ok) {
          logger.log(`  跳过（${response.status}）：${fileName}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const targetPath = `${workDir}/${fileName}`;
        await fs.writeFile(targetPath, buffer);
        files.push({ name: fileName, path: targetPath, size: buffer.byteLength });
      } catch (downloadError) {
        if (abort.signal.aborted) throw downloadError;
        logger.log(`  下载失败：${fileName}`);
      }
    }

    logger.log(`存档完成，共保存 ${files.length} 个文件。`);
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue({ files }) }
    });
  } catch (error) {
    const cancelled = abort.signal.aborted;
    logger.log(cancelled ? "任务已取消。" : `任务失败：${error instanceof Error ? error.message : "未知错误"}`);
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: cancelled ? "cancelled" : "failed",
        exitCode: cancelled ? null : 1,
        error: cancelled ? null : error instanceof Error ? error.message : "任务执行失败。",
        finishedAt: new Date()
      }
    });
  } finally {
    activeJobs.delete(jobId);
  }
}
