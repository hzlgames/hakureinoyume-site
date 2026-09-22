// Read-only live regression. Optional MUSIC_SESSION_FILE contains { cookie } for the isolated test account.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MUSIC_TEST_URL || 'http://127.0.0.1:3102';
const output = process.env.MUSIC_TEST_OUTPUT || '/tmp/music-player-live';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--renderer-process-limit=1'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  if (process.env.MUSIC_SESSION_FILE) {
    const { cookie } = JSON.parse(await readFile(process.env.MUSIC_SESSION_FILE, 'utf8'));
    const split = cookie.indexOf('=');
    await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: base, httpOnly: true, sameSite: 'Lax' }]);
  }
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__musicMedia = [];
    window.Audio = function (...args) { const media = new NativeAudio(...args); window.__musicMedia.push(media); return media; };
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const player = page.locator('.netease-player');
  await player.locator('.netease-track').first().waitFor({ timeout: 30000 });
  const button = player.getByRole('button', { name: '播放 Spring Comes Along', exact: true });
  await button.click();
  await page.waitForFunction(() => window.__musicMedia.at(-1)?.currentTime > 1.5, null, { timeout: 30000 });
  const playback = await page.evaluate(() => { const media = window.__musicMedia.at(-1); return { paused: media.paused, readyState: media.readyState, currentTime: media.currentTime, duration: media.duration, error: media.error?.code ?? null }; });
  assert.equal(playback.paused, false); assert.equal(playback.error, null);
  await player.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForTimeout(300); assert.equal(await page.evaluate(() => window.__musicMedia.at(-1).paused), true);
  await player.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => !window.__musicMedia.at(-1).paused);
  const cover = player.locator('.netease-cover img');
  await cover.waitFor(); await page.waitForFunction(() => document.querySelector('.netease-cover img')?.naturalWidth > 0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { localStorage.setItem('hakurei-color-mode', theme); window.dispatchEvent(new Event('site-theme-change')); }, theme);
    await page.waitForTimeout(350); await player.screenshot({ path: `${output}/desktop-${theme}.png` });
  }
  await page.setViewportSize({ width: 390, height: 1000 });
  await player.getByRole('button', { name: '简易', exact: true }).click();
  await page.waitForTimeout(400); await player.screenshot({ path: `${output}/mobile-compact.png` });
  await player.getByRole('button', { name: '暂停', exact: true }).click();
  const me = await (await context.request.get(base + '/api/music/me')).json();
  const playlistChecks = [];
  if (me.neteaseAuthenticated) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(nickname => document.querySelector('.netease-account-name')?.textContent === nickname, me.profile.nickname);
    await player.getByRole('button', { name: '详细', exact: true }).click();
    await player.locator('.netease-tabs').getByRole('button', { name: '网易云', exact: true }).click();
    const data = await (await context.request.get(base + '/api/music/playlists')).json();
    for (const item of data.playlists) {
      await player.getByRole('button', { name: `${item.name} ${item.trackCount}`, exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('.netease-track').length === count, item.trackCount, { timeout: 30000 });
      const count = await player.locator('.netease-track').count();
      playlistChecks.push({ declared: item.trackCount, rendered: count });
      assert.equal(count, item.trackCount);
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ playback, artworkLoaded: true, authenticatedAfterReload: me.neteaseAuthenticated, playlistChecks, browserErrors: errors, screenshots: output }));
} finally { await browser.close(); }
