import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/lib/prisma";
import { encryptSecret } from "../src/lib/zju/shared";
import { getClassroomVideos } from "../src/lib/zju/classroom";

test("classroom recordings retain array and string URLs and handle absent or invalid playback", async (t) => {
  const { CLASSROOM } = await import("login-zju");
  const encrypted = encryptSecret("fixture-password");
  const originalFindUnique = prisma.zjuAccount.findUnique;
  t.after(() => { prisma.zjuAccount.findUnique = originalFindUnique; });
  prisma.zjuAccount.findUnique = (async () => ({
    username: "fixture",
    passwordCiphertext: encrypted.ciphertext,
    passwordIv: encrypted.iv,
    passwordTag: encrypted.tag
  })) as unknown as typeof originalFindUnique;
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unmocked network request blocked"); });
  const contents = [
    JSON.stringify({ playback: { selected: 0, url: ["https://example.invalid/array.mp4"] } }),
    JSON.stringify({ playback: { url: "https://example.invalid/string.mp4" } }),
    { playback: { url: ["https://example.invalid/object.mp4"] } },
    JSON.stringify({ playback: { url: [] } }),
    "malformed",
    JSON.stringify({ playback: { url: "javascript:alert(1)" } }),
    "{}"
  ];
  t.mock.method(CLASSROOM.prototype, "fetch", async (url: string) => {
    assert.equal(new URL(url).searchParams.get("course_id"), "72886");
    return Response.json({ result: { data: [
      ...contents.map((content, i) => ({ sub_id: i + 1, course_id: "72886", status: "6", start_at: 100 - i, content })),
      { sub_id: 100, status: "1", content: contents[0] }
    ] } });
  });
  const videos = await getClassroomVideos("fixture-user", "72886");
  assert.deepEqual(videos.map(v => v.playbackUrl), [
    "https://example.invalid/array.mp4", "https://example.invalid/string.mp4",
    "https://example.invalid/object.mp4", null, null, null, null
  ]);
  assert.deepEqual(videos.map(v => v.subId), ["1", "2", "3", "4", "5", "6", "7"]);
});
