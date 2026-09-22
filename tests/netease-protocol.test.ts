import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthenticatedStatus, isLoginExpiredPayload, normalizeCookie, safeMusicUrl } from '../src/lib/netease-protocol';

test('nested login expiry and string response codes are recognized', () => {
  for (const value of [{code:301},{data:{code:301}},{data:{code:'401'}},{code:400,message:'请先登录'}]) assert.equal(isLoginExpiredPayload(value),true);
});
test('risk control and success login messages do not invalidate credentials', () => {
  for (const value of [{code:-462,message:'当前登录存在安全风险'},{code:200,message:'登录成功'},{code:502,message:'服务异常'}]) assert.equal(isLoginExpiredPayload(value),false);
});
test('real upstream anonymous response with code 200 is not an authenticated profile', () => {
  for (const value of [{data:{code:200,profile:null,account:{id:100,anonimousUser:true}}},{data:{code:200,profile:null,account:null}},{}]) assert.equal(isAuthenticatedStatus(value),false);
  assert.equal(isAuthenticatedStatus({data:{code:200,profile:{userId:123},account:{id:123}}}),true);
});
test('joined Set-Cookie attributes never become request cookie names', () => {
  assert.equal(normalizeCookie('MUSIC_U=secret; Max-Age=120; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/; HttpOnly; __csrf=abc; Domain=.music.163.com; SameSite=None; Secure'), 'MUSIC_U=secret; __csrf=abc');
  assert.equal(normalizeCookie('A=1; Path=/, B=2; Path=/; A=3'), 'A=3; B=2');
});
test('cover/media URLs reject unsafe protocols and upgrade the NetEase CDN', () => {
  assert.equal(safeMusicUrl('http://p1.music.126.net/a.jpg'), 'https://p1.music.126.net/a.jpg');
  assert.equal(safeMusicUrl('//p2.music.126.net/a.jpg'), 'https://p2.music.126.net/a.jpg');
  for (const value of ['javascript:alert(1)','data:text/html,nope','garbage',{},null]) assert.equal(safeMusicUrl(value),null);
});
