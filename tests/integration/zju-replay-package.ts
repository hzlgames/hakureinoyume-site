// Reuse an isolated real-ASR validation result; all paid-ASR operations are forbidden.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import prisma from "../../src/lib/prisma";
import { authorizeReplay } from "../../src/lib/zju/replay-transcripts";
import { claimReplay, runClaimedReplay } from "../../src/lib/zju/replay-worker";
import { exportReplayTranscriptJobs } from "../../src/lib/zju/replay-exports";
import { mergeReplayCues } from "../../src/lib/zju/replay-chunks";
import type { RecordingCue } from "../../src/lib/zju/asr/recording";
async function main() {
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith("/hakurei_subtitles_regression_"));
  const cached=await prisma.zjuReplayTranscript.findFirstOrThrow({where:{lessonKey:{startsWith:"validation:"},status:"succeeded",processedMs:{gt:0}},orderBy:{createdAt:"desc"},include:{chunks:{orderBy:{startMs:"asc"}}}});
  const users=await prisma.zjuAccount.findMany({select:{userId:true},take:2});assert.equal(users.length,2);
  const jobs=[];
  for(const u of users){await authorizeReplay(u.userId,cached.courseId,cached.subId);jobs.push(await prisma.zjuToolJob.create({data:{userId:u.userId,tool:"classroom.zju/transcript",replayTranscriptId:cached.id}}));}
  const row=(await claimReplay(randomUUID()))!;assert.equal(row.id,cached.id);
  let asrCalls=0;const forbidden=async()=>{asrCalls++;throw Error("Paid ASR is forbidden in cached-package validation");};
  await runClaimedReplay(row,"unused",AbortSignal.timeout(180000),{duration:forbidden,pcm:forbidden,submit:forbidden,poll:forbidden,resolve:forbidden,export:exportReplayTranscriptJobs});
  assert.equal(asrCalls,0);
  const firstCue=mergeReplayCues(cached.chunks.map(c=>({startMs:c.startMs,audioStartMs:c.audioStartMs,cues:c.cues as RecordingCue[]??[]})))[0];assert.ok(firstCue);
  const packages=[];
  for(const job of jobs){
    const saved=await prisma.zjuToolJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(saved.status,"succeeded",saved.error??undefined);
    const output=saved.output as {files:{name:string;path?:string}[]};const zip=output.files.find(f=>f.name.endsWith(".zip"))!;assert.ok(zip);
    const entries=execFileSync("unzip",["-Z1",zip.path!],{encoding:"utf8"}).trim().split("\n");
    assert.ok(entries.includes("课堂字幕.srt")&&entries.includes("课堂转写.txt"));
    const markdown=await readFile(path.join(saved.workDir!,entries.find(n=>n.endsWith(".md"))!),"utf8");assert.ok(markdown.includes(firstCue.text));
    assert.equal(execFileSync("unzip",["-p",zip.path!,"课堂字幕.srt"],{encoding:"utf8"}),cached.srt);
    packages.push({files:entries.length,pptImages:entries.filter(n=>/^ppt_\d+\.png$/.test(n)).length,markdownUsesCachedAsr:true,srtMatchesCache:true});
  }
  await writeFile(".data/validation/cached-package-jobs.json",JSON.stringify(jobs.map(j=>({id:j.id,userId:j.userId}))),{mode:0o600});
  const report={existingAuthorizedUsers:users.length,asrCalls,packages};await writeFile(".data/validation/cached-package-report.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
void main().catch(()=>{console.error("Cached package validation failed; inspect isolated job errors without exposing credentials.");process.exitCode=1}).finally(()=>prisma.$disconnect());
