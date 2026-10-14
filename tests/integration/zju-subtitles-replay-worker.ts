// Explicit paid integration fixture: same lesson recording, isolated database only.
import {readFile} from 'node:fs/promises';import{randomUUID}from'node:crypto';
import prisma from '../../src/lib/prisma';
import{claimSubtitle,runClaimedSubtitle,loadSubtitleKey}from'../../src/lib/zju/subtitle-worker';
import{createFfmpegAudio,pcmFrames}from'../../src/lib/zju/asr/stream.mjs';
import{createClassroomAudio}from'../../src/lib/zju/subtitle-audio';
import type{AudioAnchor}from'../../src/lib/zju/subtitle-core';
async function main(){
if(process.env.RUN_PAID_SUBTITLE_TEST!=='1')throw new Error('Paid test must be explicitly enabled');
if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/hakurei_subtitles_replay_validation_'))throw new Error('Wrong test database');
const {url,startSeconds=4200}=JSON.parse(await readFile(process.env.SUBTITLE_REPLAY_MANIFEST!,'utf8'));const key=await loadSubtitleKey();const abort=new AbortController();process.once('SIGTERM',()=>abort.abort());
const factory:typeof createClassroomAudio=options=>{
 const ff=createFfmpegAudio(url,{inputArgs:['-ss',String(startSeconds+options.audioBaseMs/1000)]});const anchors:AudioAnchor[]=[];
 const stop=()=>void ff.stop();options.signal.addEventListener('abort',stop,{once:true});
 const audio=(async function*(){let sent=options.audioBaseMs,media=options.timelineMs,sn=(options.lastSequence??-1)+1;
 try{for await(const pcm of pcmFrames(ff.audio,{chunkMs:2000,duration:options.maxAudioMs/1000})){
  const duration=pcm.length/32;anchors.push({audioStartMs:sent,audioEndMs:sent+duration,mediaStartMs:media,mediaDurationMs:duration});
  await options.onSegment({sequence:sn++,url,durationMs:duration,programDateTime:null},media,sent+duration,new Date(),false);yield pcm;sent+=duration;media+=duration;
 }}finally{options.signal.removeEventListener('abort',stop);await ff.stop();}})();return{audio,anchors};
};
while(!abort.signal.aborted){const owner=randomUUID();const row=await claimSubtitle(owner);if(row){console.log(JSON.stringify({claimed:row.id,owner,pid:process.pid,generation:row.generation}));await runClaimedSubtitle(row,key,abort.signal,factory);}const latest=await prisma.zjuLiveSubtitle.findFirst();if(latest&&['limited','completed','failed'].includes(latest.status))break;await new Promise(r=>setTimeout(r,500));}
await prisma.$disconnect();}
void main().catch(e=>{console.error(JSON.stringify({error:e.name,code:e.code}));process.exitCode=1;});
