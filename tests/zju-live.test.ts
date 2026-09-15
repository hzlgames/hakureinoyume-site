import test from "node:test";
import assert from "node:assert/strict";
import { createLiveApi, getReplayUrl, scanLive } from "../src/lib/zju/live-core";
const response = (data: unknown) => new Response(JSON.stringify(data));
test("replay supports object, JSON and URL arrays and rejects active schemes", () => {
  assert.equal(getReplayUrl({ playback: { url: ["https://example.com/a.mp4"] } }), "https://example.com/a.mp4");
  assert.equal(getReplayUrl('{"playback":{"url":"https://example.com/b.mp4"}}'), "https://example.com/b.mp4");
  assert.equal(getReplayUrl("bad json"), null);
  assert.equal(getReplayUrl({ playback: { url: "javascript:alert(1)" } }), null);
});
test("directory cache expires, refresh bypasses it, failures are not cached", async () => {
  let now = 0, calls = 0;
  const api = createLiveApi({ fetch: async () => { calls++; return response({ result: { data: [{ Id: 1, Title: "A" }, { Id: 1, Title: "A" }] } }); } }, () => now);
  assert.equal((await api.courses()).length, 1);
  await api.courses(); assert.equal(calls, 1);
  now = 300001; await api.courses(); assert.equal(calls, 2);
  await api.courses(true); assert.equal(calls, 3);
  let failures = 0;
  const broken = createLiveApi({ fetch: async () => { failures++; return response({ success: false, list: [] }); } });
  await assert.rejects(broken.today()); await assert.rejects(broken.today()); assert.equal(failures, 2);
});
test("today groups normalize status; lessons sort and inherit course ID", async () => {
  const api = createLiveApi({ fetch: async url => response({ list: url.includes("search-live") ? [{ list: [{ sub_id: 1, sub_status: 1 }, { sub_id: 2, sub_status: 2 }] }] : [{ sub_id: 1, start_at: 5 }, { sub_id: 2, start_at: 10 }] }) });
  assert.deepEqual((await api.today()).map(l => l.subId), ["1"]);
  assert.deepEqual((await api.lessons("4")).map(l => [l.subId, l.courseId]), [["2", "4"], ["1", "4"]]);
});
test("stream route selection, headers, fallback and uncached signatures", async () => {
  const calls: string[] = [];
  const api = createLiveApi({ fetch: async (url, init) => {
    calls.push(url);
    if (url.includes("getscreenstream")) {
      assert.equal(new Headers(init?.headers).get("referer"), "https://interactivemeta.cmc.zju.edu.cn/");
      return response({ list: [] });
    }
    return response({ data: { live_url: { output: { m3u8: `https://example.com/live.m3u8?sig=${calls.length}` } } } });
  } });
  const first = await api.streams("1", "2", "course_live");
  assert.equal(calls.length, 1); assert.equal(first[0].name, "教师画面");
  const second = await api.streams("1", "2", "course_live");
  assert.notEqual(first[0].url, second[0].url);
  calls.length = 0; await api.streams("1", "2"); assert.equal(calls.length, 2);
  calls.length = 0; assert.deepEqual(await api.streams("1", "2", "ilive"), []); assert.equal(calls.length, 1);
  calls.length = 0; await api.streams("1"); assert.equal(calls.length, 1);
});
test("scan warms login, bounds concurrency, reports partial failures and cancels", async () => {
  let warmed = false, running = 0, max = 0;
  const api = createLiveApi({ fetch: async url => {
    if (url.includes("account-profile")) { warmed = true; return response({ list: Array.from({ length: 9 }, (_, i) => ({ Id: i + 1, Title: `Course ${i}` })) }); }
    assert.ok(warmed); running++; max = Math.max(max, running);
    await new Promise(resolve => setTimeout(resolve, 5)); running--;
    if (url.endsWith("=3")) throw new Error("upstream failure");
    return response({ list: [{ sub_id: 10, status: 1 }] });
  } });
  const result = await scanLive(api);
  assert.equal(result.live.length, 8); assert.equal(result.failed[0].id, "3"); assert.equal(max, 4);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(scanLive(api, { signal: abort.signal }), { name: "AbortError" });
  const middle = new AbortController();
  await assert.rejects(scanLive(api, { signal: middle.signal, progress: () => middle.abort() }), { name: "AbortError" });
});
