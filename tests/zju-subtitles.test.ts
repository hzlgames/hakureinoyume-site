import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { WebSocketServer } from "ws";
import { once } from "node:events";
import { encodeRequest, decodeResponse } from "../src/lib/zju/asr/protocol.mjs";
import { recognizePcm, pcmFrames } from "../src/lib/zju/asr/stream.mjs";
import { lessonKey, parseMediaPlaylist, audioToMedia, mergeSubtitleCues, activeCue, SUBTITLE_TTL_MS } from "../src/lib/zju/subtitle-core";
import { isClassroomStream, verifySubtitleMediaAccess } from "../src/lib/zju/subtitles";
import { decodeClassroomSegment } from "../src/lib/zju/subtitle-audio";
function serverFrame(body: unknown, final = false) { const payload = gzipSync(Buffer.from(JSON.stringify(body))); const size = Buffer.alloc(4); size.writeUInt32BE(payload.length); return Buffer.concat([Buffer.from([0x11, final ? 0x92 : 0x90, 0x11, 0]), size, payload]); }
test("canonical lesson keys exclude users, screen choice and signed URLs", () => {
  assert.equal(lessonKey({courseId:"87601",subId:"2034357"}),"classroom:112:87601:2034357:classroom");
  assert.throws(() => lessonKey({courseId:"../1",subId:"2"}));
  assert.equal(SUBTITLE_TTL_MS,604800000);
});
test("media sequence and duration define source anchors; encrypted/foreign playlists fail", () => {
  const body="#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100\n#EXT-X-TARGETDURATION:2\n#EXT-X-PROGRAM-DATE-TIME:2026-10-14T12:00:00Z\n#EXTINF:2.000,\n100.ts\n#EXTINF:1.800,\n101.ts\n#EXT-X-ENDLIST";
  const p=parseMediaPlaylist(body,"https://livepgc.cmc.zju.edu.cn/path/a.m3u8");
  assert.deepEqual(p.segments.map(s=>s.sequence),[100,101]);assert.equal(p.segments[1].programDateTime,Date.parse("2026-10-14T12:00:02Z"));assert.equal(p.ended,true);
  assert.throws(()=>parseMediaPlaylist(body.replace("100.ts","http://127.0.0.1/secret"),"https://example.com/a.m3u8"));
  assert.throws(()=>parseMediaPlaylist(body+"\n#EXT-X-KEY:METHOD=AES-128","https://example.com/a.m3u8"));
});
test("audio-to-media mapping preserves real gaps and independent session offsets", () => {
  const a=[{audioStartMs:0,audioEndMs:2016,mediaStartMs:0,mediaDurationMs:2000},{audioStartMs:2016,audioEndMs:4032,mediaStartMs:6000,mediaDurationMs:2000}];
  assert.equal(audioToMedia(1008,a),1000);assert.equal(audioToMedia(3024,a),7000);
  assert.throws(()=>audioToMedia(1,[]));
});
test("revision updates replace cues; a refresh can rebuild history from a full snapshot",()=>{
  const c={id:"a",startMs:100,endMs:500,text:"临时定稿",revision:1};
  const next=mergeSubtitleCues([c],[{...c,text:"修订结果",revision:2}]);assert.equal(next.length,1);assert.equal(activeCue(next,200),"修订结果");assert.equal(activeCue(next,700),"");
  assert.deepEqual(mergeSubtitleCues([c],[],true),[]);
});
test("binary protocol supports compression, final flags and rejects truncation",()=>{
  const encoded=encodeRequest({audio:{rate:16000}});assert.deepEqual(JSON.parse(gunzipSync(encoded.subarray(8)).toString()),{audio:{rate:16000}});
  assert.equal(decodeResponse(serverFrame({result:{text:"字幕"}},true)).final,true);
  assert.throws(()=>decodeResponse(Buffer.from([0x11])));
});
test("arbitrary PCM boundaries are aligned without losing samples",async()=>{
  async function* input(){yield Buffer.alloc(13);yield Buffer.alloc(6387);yield Buffer.alloc(64);}
  const chunks=[];for await(const chunk of pcmFrames(input(),{chunkMs:200}))chunks.push(chunk.length);
  assert.deepEqual(chunks,[6400,64]);
  async function* bad(){yield Buffer.alloc(3);}await assert.rejects(async()=>{for await(const _ of pcmFrames(bad()))void _;});
});
test("real local WebSocket handles streamed revisions and final response with server-only key",async()=>{
  const server=new WebSocketServer({port:0});await once(server,"listening");const address=server.address();assert.ok(typeof address==="object"&&address);
  let audio=0,headersChecked=false;
  server.on("connection",(ws,request)=>{
    headersChecked=request.headers["x-api-key"]==="test-only-key"&&request.headers["x-api-resource-id"]==="volc.seedasr.sauc.duration";
    ws.on("message",data=>{const b=Buffer.from(data as Buffer);if(b[1]>>4===2){audio+=gunzipSync(b.subarray(8)).length;ws.send(serverFrame({result:{text:"测试直播",utterances:[{start_time:0,end_time:200,text:"测试直播",definite:(b[1]&2)!==0}]}},(b[1]&2)!==0));}});
  });
  async function* input(){yield Buffer.alloc(6400);yield Buffer.alloc(6400);}
  const events=[];
  try{for await(const e of recognizePcm(input(),{apiKey:"test-only-key",...{endpoint:`ws://127.0.0.1:${address.port}`},realtime:false}))events.push(e);assert.equal(headersChecked,true);assert.equal(audio,12800);assert.equal(events.at(-1)?.type,"session-end");assert.equal(events.at(-1)?.audioSentMs,400);}
  finally{for(const client of server.clients)client.terminate();await new Promise<void>(r=>server.close(()=>r()));}
});
test("stopping FFmpeg input releases its child and rejects invalid classroom audio",async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(decodeClassroomSegment(Buffer.alloc(10),controller.signal,2000),{name:"AbortError"});
  await assert.rejects(decodeClassroomSegment(Buffer.alloc(10),new AbortController().signal,2000),/音轨/);
});
test("two hours of simulated PCM retain continuity across 120 ASR session rotations", async () => {
  const { transcribeLive } = await import("../src/lib/zju/asr/stream.mjs");
  const server = new WebSocketServer({ port: 0 }); await once(server, "listening");
  const address = server.address(); assert.ok(typeof address === "object" && address);
  let receivedBytes = 0, connections = 0;
  server.on("connection", ws => { connections++; ws.on("message", data => {
    const b = Buffer.from(data as Buffer); if (b[1] >> 4 !== 2) return;
    receivedBytes += gunzipSync(b.subarray(8)).length;
    if (b[1] & 2) ws.send(serverFrame({ result: { text: "模拟会话定稿", utterances: [{ start_time: 0, end_time: 60000, text: "模拟会话定稿", definite: true }] } }, true));
  }); });
  async function* input() { const pcm = Buffer.alloc(6400); for (let i = 0; i < 36000; i++) yield pcm; }
  let audioMs = 0, sessions = 0;
  const heaps: number[] = [];
  try {
    for await (const event of transcribeLive({ apiKey: "test-only-key", ...{ endpoint: `ws://127.0.0.1:${address.port}` }, audio: input(), duration: 7200, sessionSeconds: 60, realtime: false })) {
      if (event.type === "session-end") { sessions++; if (sessions % 20 === 0) heaps.push(process.memoryUsage().heapUsed); audioMs = (event.offsetMs ?? 0) + event.audioSentMs!; assert.equal(audioMs, sessions * 60000); }
    }
    assert.equal(sessions, 120); assert.equal(connections, 120); assert.equal(receivedBytes, 7200 * 32000);
    assert.ok(Math.max(...heaps) - Math.min(...heaps) < 64 * 1024 * 1024, "rotation must not retain session result queues");
    assert.ok(server.clients.size <= 1, "old WebSocket connections must be closed");
  } finally { for (const client of server.clients) client.terminate(); await new Promise<void>(r => server.close(() => r())); }
});

test("only the classroom stream is eligible and an upstream 403 cannot grant subtitle access", async context => {
  assert.equal(isClassroomStream({ name: "课件画面", audioSource: "none" }), false);
  assert.equal(isClassroomStream({ name: "学生画面", audioSource: "none" }), false);
  assert.equal(isClassroomStream({ name: "教师画面", audioSource: "classroom" }), true);
  assert.equal(isClassroomStream({ name: "画面 1" }), false);
  context.mock.method(globalThis, "fetch", async () => new Response("forbidden", { status: 403 }));
  await assert.rejects(verifySubtitleMediaAccess("https://livepgc.cmc.zju.edu.cn/test.m3u8"), /无法访问/);
  await assert.rejects(verifySubtitleMediaAccess("http://127.0.0.1/private"), /来源/);
  context.mock.restoreAll();
});
