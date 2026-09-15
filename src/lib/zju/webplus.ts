import { load } from "cheerio";
import { packageArtifacts } from "./artifacts";
import { escapeHtml } from "./rich-html";
// WebPlus（webplus.zju）：通知页面与全部附件存档任务（定向正则解析）。
import prisma from "../prisma";
import { activeJobs, createJobLogger } from "./jobs";
import {
  getZjuDataRoot, materialFileName, pathSegment, toJsonValue, uniqueMaterialFileName
} from "./shared";

export function parseWebplusDoc(html: string, baseUrl: string) {
  const $ = load(html);
  const title = $('h1.arti_title').text().trim() || '无标题';
  const articleContent = $('div .article').html() || $('body').html() || '';
  const attachments: Array<{ fileName: string; url: string }> = [];
  $('a[sudyfile-attr]').each((_index, element) => {
    const link = $(element);
    const href = link.attr('href');
    if (!href || href.startsWith('javascript:')) return;
    let fileName = link.text().trim();
    try {
      const attr = JSON.parse((link.attr('sudyfile-attr') || '').replace(/'/g, '"'));
      if (attr.title) fileName = attr.title;
    } catch { /* Same fallback as upstream: use the visible link text. */ }
    attachments.push({ url: new URL(href, baseUrl).href, fileName: materialFileName(fileName || 'attachment') });
  });
  return { title, attachments, html: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${articleContent}</body></html>` };
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
    const { title, attachments, html: documentHtml } = parseWebplusDoc(html, target.href);
    logger.log(`标题：${title}，发现 ${attachments.length} 个附件。`);

    const files: Array<{ name: string; path: string; size: number }> = [];
    const usedNames = new Set<string>();

    const htmlName = uniqueMaterialFileName(`${title}.html`, usedNames);
    const htmlPath = `${workDir}/${htmlName}`;
    await fs.writeFile(htmlPath, documentHtml, "utf-8");
    files.push({ name: htmlName, path: htmlPath, size: Buffer.byteLength(documentHtml, "utf-8") });

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
      data: { status: "succeeded", exitCode: 0, finishedAt: new Date(), output: toJsonValue(await packageArtifacts(workDir, files, `${materialFileName(title)}.zip`)) }
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
