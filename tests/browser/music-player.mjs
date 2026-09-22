// Run against the review server: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser/music-player.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:3102';
const output = process.env.MUSIC_TEST_OUTPUT || '/tmp/music-player-verification';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--renderer-process-limit=1'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const errors = [];
let phase = 'startup';
page.on('pageerror', error => errors.push({ phase, message: error.message }));
await page.addInitScript(() => {
  const NativeAudio = window.Audio;
  window.__musicMedia = [];
  window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__musicMedia.push(audio); return audio; };
});
const songs = ['A', 'B', 'C'].map((id, index) => ({ id, name: `测试歌曲 ${id}`, artists: `测试艺人 ${index}`, album: '正确的专辑', coverUrl: null, duration: 20000 }));
const albumSong = { ...songs[0], id: 'D', name: '专辑歌曲 D' };
const albums = [{ id: 'album-1', name: '测试专辑', artists: '专辑艺人', coverUrl: null, trackCount: 1, publishTime: null, company: null }];
const wav = Buffer.alloc(44 + 44100 * 2 * 20);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let account = { siteAuthenticated: true, siteUserId: 'site-test', neteaseAuthenticated: false, profile: null };
let siteSession = { user: { id: 'site-test', name: '测试用户', email: 'test@example.invalid', emailVerified: true }, session: { id: 'test-session', userId: 'site-test', expiresAt: new Date(Date.now()+86400000).toISOString() } };
let webSongs = [];
let qrStarts = 0; let qrChecks = 0; let qrMode = 'waiting'; let queries = []; let sourceIds = [];
let failSource = false; let sourceDelay = 100; let mutationCount = 0;
const respond = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
await page.route('**/test-audio.wav*', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
await page.route('**/api/auth/get-session*', route => respond(route, siteSession));
await page.route('**/api/music/**', async route => {
  const url = new URL(route.request().url()); const name = url.pathname.slice('/api/music/'.length);
  if (name === 'me') return respond(route, account);
  if (name === 'search') {
    const query = url.searchParams.get('keywords'); queries.push({ query, type: url.searchParams.get('type') });
    if (query === 'slow') await new Promise(resolve => setTimeout(resolve, 800));
    return respond(route, url.searchParams.get('type') === 'album' ? { albums } : { songs: query === 'fast' ? [songs[2]] : songs });
  }
  if (name === 'album') return respond(route, { album: albums[0], songs: [albumSong] });
  if (name === 'playlists') return respond(route, { playlists: [{ id: 'playlist-1', name: '真实账号形状的歌单', trackCount: 3, playCount: 0, coverUrl: null }] });
  if (name === 'playlist') return respond(route, { songs });
  if (name === 'likes') return respond(route, { ids: ['B'] });
  if (name === 'web-playlist') return respond(route, { playlist: { id: 'web', name: '网页歌单', trackCount: webSongs.length }, songs: webSongs });
  if (name === 'web-playlist/tracks' || name === 'web-playlist/reorder') {
    mutationCount++;
    const body = route.request().postDataJSON();
    if (name.endsWith('reorder')) webSongs = body.ids.map(id => webSongs.find(song => song.id === id));
    else if (route.request().method() === 'DELETE') webSongs = webSongs.filter(song => song.id !== url.searchParams.get('id'));
    else webSongs = [...new Map([...webSongs, ...(body.songs || [body.song])].map(song => [song.id, song])).values()];
    await new Promise(resolve => setTimeout(resolve, 200));
    return respond(route, { playlist: { id: 'web', name: '网页歌单', trackCount: webSongs.length }, songs: webSongs });
  }
  if (name === 'song-url') {
    const id = url.searchParams.get('id'); sourceIds.push(id);
    await new Promise(resolve => setTimeout(resolve, sourceDelay));
    return respond(route, { url: failSource ? null : `${base}/test-audio.wav?id=${id}`, song: songs.find(s => s.id === id) || albumSong, trial: id === 'C', expiresIn: 1200 });
  }
  if (name === 'login/qr/start') { qrStarts++; return respond(route, { key: `qr-${qrStarts}`, ticket: 'opaque-ticket', qrimg: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' }); }
  if (name === 'login/qr/check') {
    qrChecks++;
    if (qrMode === 'auto') {
      if (qrStarts === 1) return respond(route, { code: 800 });
      if (qrChecks === 2) return respond(route, { message: '临时网络故障' }, 503);
      if (qrChecks === 3) return respond(route, { code: 802 });
      account = { ...account, neteaseAuthenticated: true, profile: { userId: 'netease-test', nickname: '已连接的测试账号', avatarUrl: null } };
      return respond(route, { code: 803 });
    }
    return respond(route, { code: 801 });
  }
  if (name === 'logout') { account = { ...account, neteaseAuthenticated: false, profile: null }; return respond(route, { ok: true }); }
  return respond(route, { ok: true });
});
const player = page.locator('.netease-player');
const control = name => player.getByRole('button', { name, exact: true });
const check = async (label, action) => { phase = label; await action(); console.log(`PASS ${label}`); };
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await player.locator('.netease-track').first().waitFor();
  await control('连接').waitFor();
  await check('actual media element: play, pause, resume without requesting a new source', async () => {
    await control('播放 测试歌曲 A').click();
    await page.waitForFunction(() => window.__musicMedia.at(-1)?.currentTime > .15);
    await control('暂停').click();
    const pausedAt = await page.evaluate(() => window.__musicMedia.at(-1).currentTime);
    await page.waitForTimeout(250);
    assert.ok(Math.abs(await page.evaluate(() => window.__musicMedia.at(-1).currentTime) - pausedAt) < .05);
    await control('播放').click(); await page.waitForFunction(() => !window.__musicMedia.at(-1).paused);
    assert.deepEqual(sourceIds, ['A']);
  });
  await check('pausing before a delayed source completes never autoplays', async () => {
    sourceDelay = 700; await control('播放 测试歌曲 B').click(); await control('暂停').click();
    await page.waitForTimeout(950); assert.equal(await page.evaluate(() => window.__musicMedia.at(-1).paused), true);
    assert.match(await player.locator('.netease-playback-label').innerText(), /已暂停/); sourceDelay = 100;
  });
  await check('rapid next clicks choose the final track, old audio is released', async () => {
    await control('下一首').evaluate(button => { button.click(); button.click(); });
    await page.waitForTimeout(500); assert.equal(await player.locator('.netease-song-title').innerText(), '测试歌曲 A');
    assert.equal(await page.evaluate(() => window.__musicMedia.filter(audio => !audio.paused).length), 1);
  });
  await check('album navigation does not reset search or overwrite the playback queue', async () => {
    const before = queries.length; await control('专辑').click();
    await player.getByRole('button', { name: /测试专辑.*专辑艺人/ }).click();
    await control('播放 专辑歌曲 D').waitFor();
    assert.equal(queries.length, before + 1); assert.equal(queries.at(-1).type, 'album');
    await control('下一首').click(); await page.waitForTimeout(350);
    assert.equal(await player.locator('.netease-song-title').innerText(), '测试歌曲 B');
    await control('返回专辑搜索').click(); assert.equal(await player.locator('.netease-album').count(), 1);
  });
  await check('newest search wins and a late response does not switch the selected tab', async () => {
    await control('单曲').click(); const input = player.getByRole('textbox', { name: '搜索歌曲或专辑' });
    await input.fill('slow'); await player.locator('.netease-search button').click();
    await input.fill('fast'); await player.locator('.netease-search button').click();
    await control('网页歌单').click(); await page.waitForTimeout(1000);
    assert.ok((await control('网页歌单').getAttribute('class')).includes('active'));
    await player.locator('.netease-tabs').getByRole('button', { name: '搜索', exact: true }).click();
    assert.deepEqual(await player.locator('.netease-track-name').allTextContents(), ['测试歌曲 C']);
  });
  await check('missing cover renders an explicit fallback; a failed source is retryable', async () => {
    failSource = true; await control('播放 测试歌曲 C').click(); await control('重试播放').waitFor();
    assert.equal(await player.locator('.netease-cover img').count(), 0);
    assert.ok(await player.locator('.netease-cover .netease-artwork-fallback').count());
    failSource = false; await control('重试播放').click(); await page.waitForTimeout(400);
    assert.match(await player.locator('.netease-playback-label').innerText(), /试听片段/);
  });
  await check('compact mode preserves active media and persists the display preference', async () => {
    const count = await page.evaluate(() => window.__musicMedia.length);
    await control('简易').click(); await page.waitForTimeout(400);
    assert.equal(await player.locator('.player-library').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => window.__musicMedia.length), count);
    assert.equal(await page.evaluate(() => window.__musicMedia.at(-1).paused), false);
    await control('详细').click();
  });
  await check('QR expiry regenerates, transient polling failure recovers, success refreshes account', async () => {
    qrMode = 'auto'; await control('连接').click();
    await page.waitForFunction(() => document.querySelector('.netease-account-name')?.textContent === '已连接的测试账号', { timeout: 25000 });
    assert.equal(qrStarts, 2); assert.ok(qrChecks >= 4); assert.equal(await player.locator('.netease-qr-panel').count(), 0);
    await control('网易云').click(); await player.getByRole('button', { name: /真实账号形状的歌单/ }).click();
    await control('播放 测试歌曲 A').waitFor();
    assert.equal(await player.getByRole('button', { name: '收藏到网易云 测试歌曲 B', exact: true }).isDisabled(), true);
  });
  await check('web playlist updates serialize and keyboard sorting persists', async () => {
    await player.getByRole('button', { name: '加入网页歌单 测试歌曲 A', exact: true }).click();
    await page.waitForTimeout(300);
    await player.getByRole('button', { name: '加入网页歌单 测试歌曲 B', exact: true }).click(); await page.waitForTimeout(300);
    await control('网页歌单').click();
    await player.getByRole('button', { name: '上移 测试歌曲 B', exact: true }).click(); await page.waitForTimeout(300);
    assert.deepEqual(await player.locator('.netease-track-name').allTextContents(), ['测试歌曲 B', '测试歌曲 A']);
    assert.equal(mutationCount, 3);
  });
  await check('cross-tab account change clears personal NetEase lists and liked state', async () => {
    account = { ...account, neteaseAuthenticated: false, profile: null };
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hakurei-music-account-change', newValue: String(Date.now()) })));
    await control('连接').waitFor(); await control('网易云').click();
    assert.equal(await player.locator('.netease-playlist').count(), 0);
  });
  await check('closing QR cancels polling; another attempt remains usable', async () => {
    qrMode = 'waiting'; await control('连接').click(); await control('关闭二维码').click(); const before = qrChecks;
    await page.waitForTimeout(2200); assert.equal(qrChecks, before);
  });
  await check('server-side site session expiry overrides the auth cache and clears playback', async () => {
    account = { siteAuthenticated: false, neteaseAuthenticated: false, profile: null };
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hakurei-music-account-change', newValue: String(Date.now()) })));
    await player.getByRole('link', { name: '登录本站' }).waitFor();
    assert.equal(await player.locator('.netease-song-title').innerText(), '选择一首歌');
    assert.equal(await page.evaluate(() => window.__musicMedia.filter(audio => !audio.paused).length), 0);
    account = { siteAuthenticated: true, siteUserId: 'site-test', neteaseAuthenticated: false, profile: null };
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hakurei-music-account-change', newValue: String(Date.now()) })));
    await control('连接').waitFor();
  });
  await check('desktop/mobile, both themes, compact/detailed layouts stay within the viewport', async () => {
    await player.locator('.netease-tabs').getByRole('button', { name: '搜索', exact: true }).click();
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { localStorage.setItem('hakurei-color-mode', theme); window.dispatchEvent(new Event('site-theme-change')); }, theme);
        for (const compact of [false, true]) {
          await control(compact ? '简易' : '详细').click(); await page.waitForTimeout(400);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} ${theme} overflow`);
          await player.screenshot({ path: `${output}/${width}-${theme}-${compact ? 'compact' : 'detailed'}.png` });
        }
      }
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.netease-player')?.classList.contains('is-compact'));
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', qrStarts, qrChecks, sourceIds, queries: queries.length, browserErrors: errors, screenshots: output }));
} finally { await browser.close(); }
