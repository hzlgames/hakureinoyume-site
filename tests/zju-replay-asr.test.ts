import test from "node:test";
import assert from "node:assert/strict";
import { submitRecording, pollRecording, recordingExports } from "../src/lib/zju/asr/recording";
import { pauseAlignedPcm, mergeReplayCues } from "../src/lib/zju/replay-chunks";
import { runMedia } from "../src/lib/zju/replay-media";

test("standard API uses server key, saved request ID and small PCM; polling never resubmits", async () => {
  const requests: { url: string; body: Record<string,unknown> }[] = [];
  const options = { apiKey: "private-fixture-key", requestId: "persisted-task", resourceId: "volc.seedasr.auc", signal: new AbortController().signal };
  const fake: typeof fetch = async (url,init) => {
    const headers = init!.headers as Record<string,string>;
    assert.equal(headers["X-Api-Key"],options.apiKey);assert.equal(headers["X-Api-Request-Id"],options.requestId);assert.equal(headers["X-Api-Resource-Id"],options.resourceId);
    const body = JSON.parse(String(init!.body)); requests.push({ url: String(url), body });
    if (String(url).endsWith("submit")) { assert.ok(body.audio.data);assert.equal(body.audio.url,undefined);return new Response(null,{headers:{"X-Api-Status-Code":"20000000"}}); }
    assert.deepEqual(body,{});
    if (requests.length === 2) return new Response(null,{headers:{"X-Api-Status-Code":"20000002"}});
    return Response.json({result:{text:"测试字幕。",utterances:[{start_time:10,end_time:1000,text:"测试字幕。"}]}},{headers:{"X-Api-Status-Code":"20000000"}});
  };
  await submitRecording({...options,pcm:Buffer.alloc(32000),context:"证据法学：前文"},fake);
  const request=requests[0].body.request as {corpus:{context:string}};
  assert.deepEqual(JSON.parse(request.corpus.context),{context_type:"dialog_ctx",context_data:[{text:"证据法学：前文"}]});
  const result = await pollRecording({...options,durationMs:1000,intervalMs:1},fake);
  assert.equal(result.cues[0].text,"测试字幕。");assert.equal(requests.filter(r=>r.url.endsWith("submit")).length,1);
  await assert.rejects(submitRecording({...options,pcm:Buffer.alloc(60*32000+1)},fake),/一分钟/);
});
test("provider errors and cancellations do not reveal secrets or submit additional audio", async () => {
  const options = { apiKey: "private-secret", requestId: "task", resourceId: "volc.seedasr.auc", signal: new AbortController().signal };
  await assert.rejects(pollRecording({...options,durationMs:1000},async()=>new Response("private-secret https://signed.invalid",{headers:{"X-Api-Status-Code":"45000030"}})),e=>e instanceof Error && e.message.includes("45000030") && !e.message.includes("private-secret"));
  const abort = new AbortController();let queries=0;
  const query = pollRecording({...options,signal:abort.signal,durationMs:1000,intervalMs:10000},async()=>{queries++;abort.abort();return new Response(null,{headers:{"X-Api-Status-Code":"20000001"}});});
  await assert.rejects(query,{name:"AbortError"});assert.equal(queries,1);
  assert.deepEqual(await pollRecording({...options,durationMs:1000},async()=>new Response(null,{headers:{"X-Api-Status-Code":"20000003"}})),{text:"",cues:[]});
});
test("exports preserve UTF-8 and full-course timestamps beyond an hour", () => {
  const result = recordingExports([{startMs:3600010,endMs:3601300,text:"证据法学\n转写"}]);
  assert.ok(result.srt.startsWith("\ufeff1\n01:00:00,010 --> 01:00:01,300"));assert.ok(result.srt.includes("证据法学 转写"));assert.ok(result.txt.includes("证据法学"));
});
test("abort kills the decoder and waits for its exit; media output has a hard size cap", async () => {
  const abort = new AbortController();const started = Date.now();
  const pending = runMedia(process.execPath,["-e","setInterval(()=>{},1000)"],abort.signal,32000);setTimeout(()=>abort.abort(),100);
  await assert.rejects(pending,{name:"AbortError"});assert.ok(Date.now()-started<2000);
  await assert.rejects(runMedia(process.execPath,["-e","process.stdout.write(Buffer.alloc(64000))"],new AbortController().signal,32000),/内存限制/);
});

test("chunk boundaries prefer a pause while retaining a strict cap and the entire final clip",()=>{
  const tone=Buffer.alloc(60000*32,0x11);
  assert.equal(pauseAlignedPcm(tone,false).length,tone.length);
  tone.fill(0,55000*32,55600*32);
  const aligned=pauseAlignedPcm(tone,false);
  assert.equal(aligned.length/32,55300);assert.equal(aligned.buffer,tone.buffer);
  assert.equal(pauseAlignedPcm(tone,true).length,tone.length);
  assert.equal(pauseAlignedPcm(Buffer.alloc(10000*32),false).length,10000*32);
});
test("overlapping captions keep absolute timestamps and remove repeated boundary text",()=>{
  const cues=mergeReplayCues([
    {startMs:0,audioStartMs:0,cues:[{startMs:57000,endMs:60000,text:"这就是举证责任。"}]},
    {startMs:60000,audioStartMs:58500,cues:[{startMs:0,endMs:4000,text:"举证责任，应当这样分配。"},{startMs:4000,endMs:5000,text:"下一句"}]}
  ]);
  assert.equal(cues[1].text,"应当这样分配。");assert.equal(cues[1].startMs,60000);assert.equal(cues[2].startMs,62500);
  const repeated=mergeReplayCues([{startMs:0,audioStartMs:0,cues:[{startMs:0,endMs:3000,text:"证据规则"}]},{startMs:3000,audioStartMs:1500,cues:[{startMs:0,endMs:1000,text:"证据规则。"}]}]);
  assert.equal(repeated.length,1);
});
