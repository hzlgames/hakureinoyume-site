import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/prisma";
import { reserveAsrBudget } from "../src/lib/zju/asr-budget";
import { createReplayTranscriptJob, cancelReplayJob } from "../src/lib/zju/replay-transcripts";
import { claimReplay, prepareReplayChunk, commitReplayChunk, runClaimedReplay, type ReplayDependencies } from "../src/lib/zju/replay-worker";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exportReplayTranscriptJobs } from "../src/lib/zju/replay-exports";
import { replayOutput } from "../src/lib/zju/replay-transcripts";
import { claimSubtitle } from "../src/lib/zju/subtitle-worker";
const enabled = process.env.ZJU_SUBTITLE_DB_TESTS === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.startsWith("/hakurei_subtitles_regression_")) throw new Error("Use an isolated regression database.");
test("shared replay lifecycle, common budget, exemption, crash recovery and timely cancellation",{skip:!enabled},async t=>{
  const users = [randomUUID(),randomUUID()], now=new Date(),oldBudget=process.env.ZJU_SUBTITLE_DAILY_MINUTES,oldMax=process.env.ZJU_SUBTITLE_MAX_CONCURRENT;
  for(const [i,id] of users.entries())await prisma.user.create({data:{id,name:`Replay fixture ${i}`,email:`${id}@example.invalid`,emailVerified:true,createdAt:now,updatedAt:now,asrQuotaExempt:i===1}});
  const authorize = async(_userId:string,courseId:string,subId:string)=>({courseId,subId,title:"测试课程",status:"6",type:"course_live",playbackUrl:"https://fixture.cmc.zju.edu.cn/replay.mp4",startAt:0,room:""});
  const finishExports: ReplayDependencies["export"] = async row => { await prisma.zjuToolJob.updateMany({where:{replayTranscriptId:row.id,status:{in:["queued","running"]}},data:{status:"succeeded",output:replayOutput(row)}}); };
  const ids:string[]=[];let counter=0;
  const join=async(userIndex=0)=>{const job=await createReplayTranscriptJob({userId:users[userIndex],courseId:"999",subId:String(++counter)},authorize);ids.push(job.replayTranscriptId!);return job;};
  try {
    await t.test("two users join one lesson; cancelling one preserves the other, cancelling last fences the worker",async()=>{
      const a=await join(),input={userId:users[1],courseId:"999",subId:String(counter)};
      const others=await Promise.all(Array.from({length:8},()=>createReplayTranscriptJob(input,authorize)));
      assert.ok(others.every(j=>j.replayTranscriptId===a.replayTranscriptId));assert.equal(new Set(others.map(j=>j.id)).size,1);
      const claims=await Promise.all(Array.from({length:8},()=>claimReplay(randomUUID())));assert.equal(claims.filter(Boolean).length,1);const row=claims.find(Boolean)!;
      await cancelReplayJob(users[0],a.id);assert.equal((await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:row.id}})).status,"running");
      await cancelReplayJob(users[1],others[0].id);assert.equal((await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:row.id}})).status,"idle");
      await assert.rejects(prepareReplayChunk(row,1000),{name:"AbortError"});
      await assert.rejects(createReplayTranscriptJob({...input,subId:"unauthorized"},async()=>{throw Error("denied")}),/denied/);
    });
    await t.test("live and replay share atomic concurrency slots in both directions",async()=>{
      process.env.ZJU_SUBTITLE_MAX_CONCURRENT="1";const job=await join();
      const live=await prisma.zjuLiveSubtitle.create({data:{lessonKey:randomUUID(),courseId:"9",subId:"8",type:"course_live",title:"直播",expiresAt:new Date(Date.now()+60000),viewers:{create:{userId:users[0],clientId:randomUUID()}}}});
      try{const claim=await claimSubtitle(randomUUID());assert.equal(claim?.id,live.id);assert.equal(await claimReplay(randomUUID()),null);await prisma.zjuLiveSubtitle.update({where:{id:live.id},data:{status:"idle"}});const replay=await claimReplay(randomUUID());assert.equal(replay?.id,job.replayTranscriptId);await prisma.zjuLiveSubtitle.update({where:{id:live.id},data:{status:"queued"}});assert.equal(await claimSubtitle(randomUUID()),null);await cancelReplayJob(users[0],job.id);}finally{await prisma.zjuLiveSubtitle.delete({where:{id:live.id}});delete process.env.ZJU_SUBTITLE_MAX_CONCURRENT;}
    });
    await t.test("ordinary pool cannot overspend; exempt user is tracked separately and bypasses exhausted pool",async()=>{
      process.env.ZJU_SUBTITLE_DAILY_MINUTES="1";const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(new Date());await prisma.zjuLiveSubtitleDailyUsage.deleteMany({where:{day}});
      const attempts=await Promise.allSettled(Array.from({length:3},()=>prisma.$transaction(tx=>reserveAsrBudget(tx,30000,false))));assert.equal(attempts.filter(a=>a.status==="fulfilled").length,2);
      const admin=await join(1),row=await claimReplay(randomUUID());assert.equal(row?.id,admin.replayTranscriptId);await prepareReplayChunk(row!,60000);
      const used=await prisma.zjuLiveSubtitleDailyUsage.findUniqueOrThrow({where:{day}});assert.equal(used.audioMs,60000);assert.equal(used.exemptAudioMs,60000);
      await cancelReplayJob(users[1],admin.id);await prisma.zjuLiveSubtitleDailyUsage.deleteMany({where:{day}});process.env.ZJU_SUBTITLE_DAILY_MINUTES="120";
    });
    await t.test("lease takeover queries saved task instead of paying again; successful results persist and are reused",async()=>{
      const job=await join(),old=await claimReplay(randomUUID());await prisma.zjuReplayTranscript.update({where:{id:old!.id},data:{durationMs:1000}});
      const prepared=await prepareReplayChunk(old!,1000);assert.equal(prepared.shouldSubmit,true);
      await prisma.zjuReplayTranscript.update({where:{id:old!.id},data:{leaseUntil:new Date(Date.now()-1000)}});const replacement=(await claimReplay(randomUUID()))!;
      await assert.rejects(commitReplayChunk(old!,prepared.chunk.id,[]),{name:"AbortError"});let submissions=0,queries=0;
      const deps:ReplayDependencies={export:finishExports,duration:async()=>1000,pcm:async()=>{throw Error("must not decode again")},submit:async()=>{submissions++},poll:async options=>{queries++;assert.equal(options.requestId,prepared.chunk.requestId);return{text:"持久字幕",cues:[{startMs:0,endMs:1000,text:"持久字幕"}]}},resolve:async()=>"unused"};
      await runClaimedReplay(replacement,"fixture",new AbortController().signal,deps);assert.equal(submissions,0);assert.equal(queries,1);
      const saved=await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:old!.id}});assert.equal(saved.status,"succeeded");assert.ok(saved.srt.includes("持久字幕"));
      const second=await createReplayTranscriptJob({userId:users[1],courseId:"999",subId:String(counter)},authorize);assert.equal(second.replayTranscriptId,job.replayTranscriptId);assert.equal(second.status,"queued");const cached=(await claimReplay(randomUUID()))!;assert.equal(cached.id,saved.id);await runClaimedReplay(cached,"fixture",new AbortController().signal,deps);assert.equal(submissions,0);assert.equal(queries,1);assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:second.id}})).status,"succeeded");assert.equal(await claimReplay(randomUUID()),null);
    });
    await t.test("last cancellation aborts decoding within two seconds and prevents any paid submission",async()=>{
      const job=await join(),row=(await claimReplay(randomUUID()))!;let decoded=false,submissions=0;
      const deps:ReplayDependencies={export:finishExports,duration:async()=>60000,pcm:async(_url,_start,_duration,signal)=>{decoded=true;await new Promise<void>((_resolve,reject)=>{signal.addEventListener("abort",()=>reject(new DOMException("Stopped","AbortError")),{once:true});});return Buffer.alloc(1)},submit:async()=>{submissions++},poll:async()=>({text:"",cues:[]}),resolve:async()=>"unused"};
      const run=runClaimedReplay(row,"fixture",new AbortController().signal,deps);while(!decoded)await new Promise(r=>setTimeout(r,20));const stopped=Date.now();await cancelReplayJob(users[0],job.id);await run;assert.ok(Date.now()-stopped<2200);assert.equal(submissions,0);assert.equal(await prisma.zjuReplayTranscriptChunk.count({where:{transcriptId:row.id}}),0);
    });
    await t.test("packaging restart reuses saved ASR, preserves PPT and does not turn package failures into paid retries",async()=>{
      const root=await fs.mkdtemp(path.join(os.tmpdir(),"replay-packaging-"));
      try {
        const job=await join(),row=(await claimReplay(randomUUID()))!;
        const chunk=await prepareReplayChunk(row,1000);const done=await commitReplayChunk(row,chunk.chunk.id,[{startMs:0,endMs:1000,text:"火山替换字幕"}]);
        await prisma.zjuReplayTranscript.update({where:{id:row.id},data:{durationMs:1000,processedMs:950,leaseUntil:new Date(Date.now()-1)}});
        const replacement=(await claimReplay(randomUUID()))!;
        const bad=async()=>{throw Error("ASR must not run during cached export")};
        const fail:ReplayDependencies={duration:bad,pcm:bad,submit:bad,poll:bad,resolve:bad,export:async(r,s)=>exportReplayTranscriptJobs(r,s,{root,client:async()=>{throw Error("PPT unavailable")}})};
        await runClaimedReplay(replacement,"fixture",new AbortController().signal,fail);
        assert.equal((await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:row.id}})).status,"succeeded");assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:job.id}})).status,"failed");
        const next=await createReplayTranscriptJob({userId:users[1],courseId:"999",subId:String(counter)},authorize);assert.equal(next.status,"queued");
        const cached=(await claimReplay(randomUUID()))!;let schoolCaptions=0;
        await runClaimedReplay(cached,"fixture",new AbortController().signal,{...fail,export:async(r,s)=>exportReplayTranscriptJobs(r,s,{root,client:async()=>({fetch:async url=>{if(url.includes("search-ppt"))return Response.json({list:[{created_sec:0,content:{pptimgurl:"https://fixture.invalid/slide"}}]});if(url.includes("search-trans-result"))schoolCaptions++;return new Response(new Uint8Array([137,80,78,71]));}})})});
        const saved=await prisma.zjuToolJob.findUniqueOrThrow({where:{id:next.id}});assert.equal(saved.status,"succeeded");assert.equal(schoolCaptions,0);
        assert.ok((await fs.readFile(path.join(saved.workDir!,"测试课程.md"),"utf8")).includes("火山替换字幕"));assert.ok(done.srt.includes("火山替换字幕"));assert.equal(await prisma.zjuReplayTranscriptChunk.count({where:{transcriptId:row.id}}),1);
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
    await t.test("cancelling one user's PPT export stops its download and still finishes another user's package",async()=>{
      const root=await fs.mkdtemp(path.join(os.tmpdir(),"replay-package-cancel-"));
      try {
        const first=await join(),second=await createReplayTranscriptJob({userId:users[1],courseId:"999",subId:String(counter)},authorize),row=(await claimReplay(randomUUID()))!;
        await prisma.zjuReplayTranscript.update({where:{id:row.id},data:{durationMs:1000,processedMs:1000,srt:"字幕",txt:"字幕"}});let downloading=false;
        const exporting=exportReplayTranscriptJobs({...row,durationMs:1000,processedMs:1000},new AbortController().signal,{root,client:async userId=>({fetch:async(_url,options)=>{
          if(userId===users[0]){downloading=true;await new Promise<void>((_r,reject)=>options!.signal!.addEventListener("abort",()=>reject(new DOMException("Stopped","AbortError")),{once:true}));}
          return Response.json({list:[]});
        }})});
        while(!downloading)await new Promise(r=>setTimeout(r,10));const cancelledAt=Date.now();await cancelReplayJob(users[0],first.id);await exporting;
        assert.ok(Date.now()-cancelledAt<2200);assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:first.id}})).status,"cancelled");assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:second.id}})).status,"succeeded");
        await prisma.zjuReplayTranscript.update({where:{id:row.id},data:{status:"succeeded",leaseOwner:null,leaseUntil:null}});
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
    await t.test("two-hour simulated replay preserves overlap, context, bounded buffers and continuous progress",async()=>{
      const job=await join(1),row=(await claimReplay(randomUUID()))!;
      const durationMs=7200000;let submissions=0,decodedEnd=0,chargedMs=0;
      const deps:ReplayDependencies={export:finishExports,
        duration:async()=>durationMs,
        pcm:async(_url,start,duration)=>{
          assert.equal(start,Math.max(0,decodedEnd-1500));assert.ok(duration<=60000);
          decodedEnd=start+duration;return Buffer.alloc(duration*32,0x11);
        },
        submit:async options=>{submissions++;chargedMs+=options.pcm.length/32;assert.ok(options.pcm.length<=1920000);if(submissions>1)assert.ok(options.context?.includes("上下文"));},
        poll:async options=>({text:"上下文",cues:[{startMs:0,endMs:options.durationMs,text:"上下文"}]}),
        resolve:async()=>"unused"
      };
      await runClaimedReplay(row,"fixture",new AbortController().signal,deps);
      const saved=await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:row.id}});
      assert.equal(saved.status,"succeeded");assert.equal(saved.processedMs,durationMs);
      assert.ok(submissions>120 && submissions<125);assert.equal(chargedMs,durationMs+(submissions-1)*1500);
      assert.ok(saved.srt.includes("02:00:00,000"));assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:job.id}})).status,"succeeded");
    });
    await t.test("cancelling a submitted segment leaves a recoverable ID and sends no next segment",async()=>{
      const job=await join(),row=(await claimReplay(randomUUID()))!;let polling=false,submissions=0;
      const deps:ReplayDependencies={export:finishExports,duration:async()=>120000,pcm:async()=>Buffer.alloc(60000*32,0x11),submit:async()=>{submissions++},poll:async options=>{polling=true;await new Promise<void>((_r,reject)=>options.signal.addEventListener("abort",()=>reject(new DOMException("Stopped","AbortError")),{once:true}));return{text:"",cues:[]}},resolve:async()=>"unused"};
      const run=runClaimedReplay(row,"fixture",new AbortController().signal,deps);while(!polling)await new Promise(r=>setTimeout(r,20));await cancelReplayJob(users[0],job.id);await run;assert.equal(submissions,1);const chunk=await prisma.zjuReplayTranscriptChunk.findFirstOrThrow({where:{transcriptId:row.id}});assert.equal(chunk.durationMs,60000);assert.equal(chunk.status,"submitting");assert.equal((await prisma.zjuToolJob.findUniqueOrThrow({where:{id:job.id}})).status,"cancelled");
    });
  }finally{await prisma.zjuReplayTranscript.deleteMany({where:{id:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:users}}});if(oldBudget===undefined)delete process.env.ZJU_SUBTITLE_DAILY_MINUTES;else process.env.ZJU_SUBTITLE_DAILY_MINUTES=oldBudget;if(oldMax===undefined)delete process.env.ZJU_SUBTITLE_MAX_CONCURRENT;else process.env.ZJU_SUBTITLE_MAX_CONCURRENT=oldMax;await prisma.$disconnect();}
});
