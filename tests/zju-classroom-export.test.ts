import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildClassroomTranscript, type ClassroomExportOptions } from "../src/lib/zju/classroom-export";
import { serializeZjuJob } from "../src/app/api/zju/_shared";

test("both subtitle choices preserve PPT + Markdown + ZIP, and Volcengine replaces all school captions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"classroom-export-"));
  try {
    for (const source of ["zhiyun","volcengine"] as const) {
      const requests: string[] = [], workDir = path.join(root,source);
      const client: ClassroomExportOptions["client"] = { fetch: async url => {
        requests.push(url);
        if (url.includes("search-ppt")) return Response.json({ list: [{ created_sec: 20, content: JSON.stringify({ pptimgurl: "https://fixture.invalid/ppt.png" }) }] });
        if (url.includes("search-trans-result")) return Response.json({ list: [{ all_content: [{ BeginSec: 10, Text: "智云原字幕" },{ BeginSec: 30, Text: "智云后一句" }] }] });
        if (url.endsWith("ppt.png")) return new Response(new Uint8Array([137,80,78,71]));
        throw Error("unexpected request");
      } };
      const output = await buildClassroomTranscript({ client, courseId: "1", subId: "2", title: "测试课", workDir, log: () => {}, signal: new AbortController().signal, ...(source === "volcengine" ? { subtitles: [{ beginSec: 5, text: "火山前一句" },{ beginSec: 25, text: "火山后一句" }], textFiles: { "课堂字幕.srt": "火山 SRT", "课堂转写.txt": "火山 TXT" } } : {}) });
      const markdown = await fs.readFile(path.join(workDir,"测试课.md"),"utf8");
      const entries = execFileSync("unzip",["-Z1",output.files[0].path],{encoding:"utf8"});
      assert.ok(entries.includes("ppt_001.png"));assert.ok(entries.includes("测试课.md"));assert.equal(output.files[0].name,"测试课.zip");
      if (source === "volcengine") {
        assert.equal(requests.some(url => url.includes("search-trans-result")),false);
        assert.equal(markdown.includes("智云"),false);assert.ok(markdown.indexOf("火山前一句") < markdown.indexOf("ppt_001.png"));assert.ok(markdown.indexOf("ppt_001.png") < markdown.indexOf("火山后一句"));
        assert.ok(entries.includes("课堂字幕.srt"));assert.ok(entries.includes("课堂转写.txt"));
        assert.equal(execFileSync("unzip",["-p",output.files[0].path,"课堂字幕.srt"],{encoding:"utf8"}),"火山 SRT");
      } else { assert.ok(markdown.includes("智云原字幕"));assert.ok(markdown.includes("智云后一句")); }
    }
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test("an explicit empty ASR result never falls back to school captions; cancelled PPT requests stop export",async()=>{
  const workDir=await fs.mkdtemp(path.join(os.tmpdir(),"classroom-empty-"));
  try {
    let requests=0;const abort=new AbortController();
    const base:ClassroomExportOptions={workDir,title:"空字幕",courseId:"1",subId:"2",signal:abort.signal,subtitles:[],textFiles:{"课堂字幕.srt":"\ufeff"},log:()=>{},client:{fetch:async()=>{requests++;return Response.json({list:[]})}}};
    const output=await buildClassroomTranscript(base);assert.equal(requests,1);assert.equal(output.files.length,1);assert.equal(await fs.readFile(path.join(workDir,"空字幕.md"),"utf8"),"");
    abort.abort();await assert.rejects(buildClassroomTranscript(base),{name:"AbortError"});assert.equal(requests,1);
  }finally{await fs.rm(workDir,{recursive:true,force:true});}
});
test("expired packages disappear while persistent subtitles remain and server paths never reach the client",()=>{
  const job={createdAt:new Date("2020-01-01"),replayTranscriptId:"shared",workDir:"/private",output:{files:[{name:"课程.zip",path:"/private/export.zip",size:10},{name:"课堂字幕.srt",size:20},{name:"课堂转写.txt",size:30}]}};
  const fresh=serializeZjuJob({...job,createdAt:new Date()});assert.equal(fresh.output.files.length,3);assert.equal(JSON.stringify(fresh).includes("/private"),false);
  const expired=serializeZjuJob(job);assert.deepEqual(expired.output.files.map(f=>f.name),["课堂字幕.srt","课堂转写.txt"]);assert.equal(expired.filesExpired,false);
});
