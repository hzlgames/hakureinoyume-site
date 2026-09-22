import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQrTicket, extractCookie, readQrTicket, requestNetease, NeteaseServiceError } from '../src/lib/netease';

test('QR ticket is bound to the current site user, session, and QR key; tampering fails', () => {
  const ticket = createQrTicket({ userId: 'user-A', sessionId: 'session-A', key: 'qr-A', cookie: 'MUSIC_A=private' });
  assert.equal(ticket.includes('private'), false);
  assert.equal(readQrTicket(ticket, 'user-A', 'session-A', 'qr-A')?.cookie, 'MUSIC_A=private');
  assert.equal(readQrTicket(ticket, 'user-B', 'session-A', 'qr-A'), null);
  assert.equal(readQrTicket(ticket, 'user-A', 'session-B', 'qr-A'), null);
  assert.equal(readQrTicket(ticket, 'user-A', 'session-A', 'qr-B'), null);
  assert.equal(readQrTicket(ticket.slice(0, 20) + 'tampered', 'user-A', 'session-A', 'qr-A'), null);
  const originalNow = Date.now;
  try { Date.now = () => originalNow() + 6 * 60000; assert.equal(readQrTicket(ticket, 'user-A', 'session-A', 'qr-A'), null); }
  finally { Date.now = originalNow; }
});
test('cookie extraction handles joined attributes and multiple response headers', () => {
  assert.equal(extractCookie({ cookie: 'MUSIC_U=secret; Path=/; HttpOnly; __csrf=csrf; Path=/' }), 'MUSIC_U=secret; __csrf=csrf');
  assert.equal(extractCookie({}, new Headers([['set-cookie', 'MUSIC_U=secret; HttpOnly; Path=/'], ['set-cookie', '__csrf=csrf; Path=/']])), 'MUSIC_U=secret; __csrf=csrf');
});
test('HTTP failure retains login expiry meaning without exposing upstream payloads', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ code: 301, message: '需要登录' }, { status: 401 });
    await assert.rejects(requestNetease('/test'), error => error instanceof NeteaseServiceError && error.code === 'netease_login_required' && error.status === 401);
    globalThis.fetch = async () => Response.json({ data: { code: 301 } });
    await assert.rejects(requestNetease('/test'), error => error instanceof NeteaseServiceError && error.code === 'netease_login_required');
  } finally { globalThis.fetch = originalFetch; }
});
test('malformed JSON and empty response envelopes fail explicitly instead of masquerading as empty results', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const body of ['<html>upstream error</html>', '{}', 'null', '']) {
      globalThis.fetch = async () => new Response(body);
      await assert.rejects(requestNetease('/test'), error => error instanceof NeteaseServiceError && error.code === 'netease_invalid_response');
    }
  } finally { globalThis.fetch = originalFetch; }
});
test('risk-control errors are actionable and do not invalidate the stored login', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ code: -462, message: '当前登录存在安全风险' });
    await assert.rejects(requestNetease('/test'), error => error instanceof NeteaseServiceError && error.code === 'netease_risk_control');
  } finally { globalThis.fetch = originalFetch; }
});

test('POST queries and account cookies cannot collide in the Enhanced URL-based cache, even in the same millisecond', async () => {
  const originalFetch = globalThis.fetch; const originalNow = Date.now;
  const urls: string[] = []; const bodyCookies: string[] = [];
  try {
    Date.now = () => 1000;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input)); urls.push(url.href);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('x-apicache-bypass'), '1');
      assert.equal(url.searchParams.get('timestamp'), '1000');
      assert.equal(url.searchParams.has('cookie'), false);
      const body = new URLSearchParams(String(init?.body)); bodyCookies.push(body.get('cookie')!);
      return Response.json({ code: 200, playlist: { id: body.get('id') } });
    };
    const a = await requestNetease('/playlist/detail', { id: 'first' }, { cookie: 'MUSIC_U=account-A' });
    const b = await requestNetease('/playlist/detail', { id: 'second' }, { cookie: 'MUSIC_U=account-B' });
    assert.notEqual(urls[0], urls[1]); assert.deepEqual(bodyCookies, ['MUSIC_U=account-A', 'MUSIC_U=account-B']);
    assert.deepEqual(a.payload.playlist, { id: 'first' }); assert.deepEqual(b.payload.playlist, { id: 'second' });
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
