import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeClientLogin } from '../src/lib/zju/client-login';
import { buildCoursesClient } from '../src/lib/zju/shared';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
test('simultaneous initial course API requests use one login and stay parallel afterward', async () => {
  const { COURSES } = await import('login-zju');
  const originalLogin = COURSES.prototype.login;
  const originalFetch = globalThis.fetch;
  let logins = 0; let ready = false; let pending = 0; let peak = 0;
  COURSES.prototype.login = async () => { logins++; await tick(); ready = true; return true; };
  globalThis.fetch = async () => {
    assert.ok(ready);
    pending++; peak = Math.max(peak, pending);
    await tick(); pending--;
    return Response.json({ ok: true });
  };
  try {
    const client = await buildCoursesClient({ username: 'fixture', password: 'fixture', pintiaCookie: null });
    const responses = await Promise.all(['reads', 'homework', 'scores', 'exams'].map(path => client.fetch(`https://courses.zju.edu.cn/api/${path}`)));
    assert.equal(logins, 1);
    assert.equal(peak, 4);
    assert.ok(responses.every(response => response.ok));
    await client.fetch('https://courses.zju.edu.cn/api/next');
    assert.equal(logins, 1);
  } finally { COURSES.prototype.login = originalLogin; globalThis.fetch = originalFetch; }
});
test('failed concurrent login is shared, then a later attempt can retry', async () => {
  let calls = 0;
  const client = serializeClientLogin({ async login() { calls++; await tick(); if (calls === 1) throw new Error('SSO failed'); return true; } });
  const results = await Promise.allSettled([client.login(), client.login(), client.login()]);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(await client.login(), true);
  assert.equal(calls, 2);
});
test('separate clients do not share account authentication', async () => {
  const calls: string[] = [];
  const create = (name: string) => serializeClientLogin({ name, async login() { calls.push(this.name); await tick(); return this.name; } });
  const a = create('a'); const b = create('b');
  assert.deepEqual(await Promise.all([a.login(), b.login(), a.login()]), ['a', 'b', 'a']);
  assert.deepEqual(calls.sort(), ['a', 'b']);
});
