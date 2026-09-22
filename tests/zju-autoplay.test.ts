import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAutoplayCourseState } from '../src/lib/zju/autoplay';
import type { CoursesClient } from '../src/lib/zju/shared';

test('activity listing completes lazy login before concurrent completion reads', async () => {
  let ready = false;
  const activity = { id: 123, type: 'page', title: 'Example' };
  const client = { async fetch(url: string) {
    if (url.includes('/activities?')) {
      await new Promise(resolve => setTimeout(resolve, 10));
      ready = true;
      return Response.json({ activities: [activity] });
    }
    assert.ok(ready, 'parallel requests must not start another lazy SSO login');
    if (url.endsWith('/my-completeness')) {
      return Response.json({ completed_result: { completed: { learning_activity: [123] } } });
    }
    return Response.json({ activity_reads: [{ activity_id: 456, completeness: 'full' }] });
  } } as CoursesClient;
  const { payload, completedIds } = await loadAutoplayCourseState(client, '102040');
  assert.deepEqual(payload.activities, [activity]);
  assert.deepEqual([...completedIds].sort(), [123, 456]);
});

test('failed initial request is surfaced without launching further login requests', async () => {
  let calls = 0;
  const client = { async fetch() { calls++; return new Response(null, { status: 400 }); } } as unknown as CoursesClient;
  await assert.rejects(loadAutoplayCourseState(client, '102040'), /request failed: 400/);
  assert.equal(calls, 1);
});

test('empty courses and unavailable optional completion endpoints remain readable', async () => {
  const client = { async fetch(url: string) {
    return url.includes('/activities?') ? Response.json({ activities: [] }) : new Response(null, { status: 503 });
  } } as CoursesClient;
  const { payload, completedIds } = await loadAutoplayCourseState(client, '102040');
  assert.deepEqual(payload.activities, []);
  assert.equal(completedIds.size, 0);
});
