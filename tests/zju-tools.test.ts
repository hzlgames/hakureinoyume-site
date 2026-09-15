import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { artifactExpiresAt, artifactsExpired, packageArtifacts } from "../src/lib/zju/artifacts";
import { safeRichHtml } from "../src/lib/zju/rich-html";
import { parseWebplusDoc } from "../src/lib/zju/webplus";
import { changedScores, calculateMetrics } from "../src/lib/zju/grade-core";
import { inGradeWindow } from "../src/lib/zju/grades";

test("downloads bundle related Markdown assets and keep small independent attachments separate", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zju-artifacts-test-"));
  try {
    const names = ["课程.md", "ppt_001.png", "ppt_002.png", "a.pdf", "b.pdf", "c.pdf"];
    const files = await Promise.all(names.map(async (name) => { const filePath = path.join(dir, name); await fs.writeFile(filePath, name.endsWith(".md") ? "![](ppt_001.png)" : "fixture"); return { name, path: filePath, size: (await fs.stat(filePath)).size }; }));
    const small = await packageArtifacts(dir, files.slice(1, 3));
    assert.equal(small.files.length, 2);
    const markdown = await packageArtifacts(dir, files.slice(0, 3));
    assert.equal(markdown.files.length, 1);
    const content = execFileSync("python3", ["-c", "import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps(z.namelist()))", markdown.files[0].path], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(content), names.slice(0, 3));
    const many = await packageArtifacts(dir, files);
    assert.equal(many.files.length, 1);
    assert.equal(many.fileCount, 6);
    const created = new Date("2026-09-13T00:00:00Z");
    assert.ok(artifactExpiresAt(created).getTime() - created.getTime() < 48 * 3600000);
    assert.equal(artifactsExpired(created, artifactExpiresAt(created).getTime()), true);
    assert.equal(artifactsExpired(created, created.getTime()), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test("SaveDoc follows upstream body extraction and decodes attachment names", () => {
  const html = `<html><body><nav>navigation</nav><div><h1 class="arti_title">通知 &amp; 附件</h1><div class="article">正文<a href="/files/a.pdf" sudyfile-attr="{&quot;title&quot;:&quot;课件.pdf&quot;}">下载</a></div></div></body></html>`;
  const doc = parseWebplusDoc(html, "https://example.zju.edu.cn/notice/a.htm");
  assert.equal(doc.title, "通知 & 附件");
  assert.equal(doc.attachments[0].fileName, "课件.pdf");
  assert.equal(doc.attachments[0].url, "https://example.zju.edu.cn/files/a.pdf");
  assert.ok(doc.html.includes("正文")); assert.ok(!doc.html.includes("navigation"));
});
test("quiz preserves images and rich content without active scripts", () => {
  const html = safeRichHtml('<p><strong>题目</strong><img src="/pic.png" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">答案</a></p>');
  assert.ok(html.includes("<strong>题目</strong>"));
  assert.ok(html.includes('src="https://courses.zju.edu.cn/pic.png"'));
  assert.ok(!html.includes("onerror")); assert.ok(!html.includes("<script")); assert.ok(!html.includes("javascript:"));
});
test("grade differences and weighted metrics match upstream, monitor uses Shanghai time", () => {
  const old = { a: { xkkh: "a", cj: "80", jd: "3", xf: "2" } };
  const rows = [{ xkkh: "a", cj: "90", jd: "4", xf: "2" }, { xkkh: "b", cj: "合格", jd: "1", xf: "1" }];
  assert.equal(changedScores(old, rows).length, 2);
  assert.deepEqual(calculateMetrics(rows), { gpa: 4, percentAverage: 90, totalCredits: 2 });
  assert.equal(inGradeWindow({ startHour: 8, endHour: 24 }, new Date("2026-09-13T00:00:00Z")), true);
  assert.equal(inGradeWindow({ startHour: 8, endHour: 24 }, new Date("2026-09-13T16:00:00Z")), false);
});
