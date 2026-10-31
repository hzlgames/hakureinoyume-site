// Explicitly paid, <=180 seconds, isolated DB with two existing authorized ZJU accounts.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import prisma from "../../src/lib/prisma";
import { authorizeReplay } from "../../src/lib/zju/replay-transcripts";
import { claimReplay, runClaimedReplay } from "../../src/lib/zju/replay-worker";
import { loadSubtitleKey } from "../../src/lib/zju/subtitle-worker";
import { replayDuration, replayPcm } from "../../src/lib/zju/replay-media";
import { submitRecording, pollRecording } from "../../src/lib/zju/asr/recording";
async function main() {
  if (process.env.RUN_PAID_REPLAY_TEST !== "1" || !new URL(process.env.DATABASE_URL!).pathname.startsWith("/hakurei_subtitles_regression_")) throw new Error("Explicitly enable the paid test in an isolated review database.");
  const courseId = process.env.REPLAY_TEST_COURSE || "87601", subId = process.env.REPLAY_TEST_LESSON || "2034357";
  const startMs = Number(process.env.REPLAY_TEST_START_MS || 4200000), durationMs = Number(process.env.REPLAY_TEST_DURATION_MS || 20000);
  assert.ok(Number.isSafeInteger(startMs) && startMs >= 0 && Number.isSafeInteger(durationMs) && durationMs >= 1000 && durationMs <= 180000);
  const users = await prisma.zjuAccount.findMany({ select: { userId: true }, take: 2 }); assert.equal(users.length,2);
  const signal = AbortSignal.timeout(180000), started = Date.now();
  const lessons = await Promise.all(users.map(u=>authorizeReplay(u.userId,courseId,subId)));
  assert.ok(await replayDuration(lessons[0].playbackUrl!,signal) >= startMs+durationMs);
  const row = await prisma.zjuReplayTranscript.create({ data: { lessonKey: "validation:"+randomUUID(), courseId, subId, title: `真实回放 ${durationMs/1000} 秒验证片段`, durationMs } });
  for (const u of users) await prisma.zjuToolJob.create({ data: { userId: u.userId, tool: "classroom.zju/transcript", replayTranscriptId: row.id } });
  const claimed = await claimReplay(randomUUID()); assert.equal(claimed?.id,row.id);
  let pcmBytes=0, submissions=0;
  await runClaimedReplay(claimed!,await loadSubtitleKey(),signal,{
    duration: replayDuration,
    pcm: async(url,start,duration,signal)=>{const pcm=await replayPcm(url,start+startMs,duration,signal);pcmBytes+=pcm.length;return pcm;},
    submit: async options=>{submissions++;await submitRecording(options);}, poll: pollRecording, resolve: async()=>lessons[0].playbackUrl!
  });
  const saved=await prisma.zjuReplayTranscript.findUniqueOrThrow({where:{id:row.id}});assert.equal(saved.status,"succeeded",saved.error??undefined);
  const jobs=await prisma.zjuToolJob.findMany({where:{replayTranscriptId:row.id},select:{status:true}});assert.ok(jobs.every(j=>j.status==="succeeded"));
  const chunks=await prisma.zjuReplayTranscriptChunk.findMany({where:{transcriptId:row.id},orderBy:{startMs:"asc"},select:{startMs:true,audioStartMs:true,durationMs:true}});
  const report={chunks,courseId,subId,clipStartMs:startMs,audioMs:saved.processedMs,pcmBytes,submissions,textCharacters:saved.txt.length,srtBytes:Buffer.byteLength(saved.srt),existingAuthorizedUsers:users.length,wallMs:Date.now()-started};
  if(process.env.REPLAY_TEST_REPORT)await writeFile(process.env.REPLAY_TEST_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
void main().catch(()=>{console.error("Paid replay validation failed; inspect the isolated registry without exposing credentials.");process.exitCode=1}).finally(()=>prisma.$disconnect());
