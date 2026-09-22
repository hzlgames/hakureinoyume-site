import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayback } from '../src/lib/music-playback';
import type { MusicSong, SongSource } from '../src/lib/music-types';

const song = (id: string): MusicSong => ({ id, name: id, artists: 'Artist', album: 'Album', coverUrl: null, duration: 90000 });
const songs = ['A', 'B', 'C'].map(song);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class FakeAudio {
  paused = true; ended = false; duration = 90; currentTime = 0; volume = 1; muted = false; src = ''; preload = '';
  error: { code: number } | null = null;
  onplaying: (() => void) | null = null; onpause: (() => void) | null = null;
  onended: (() => void) | null = null; onerror: (() => void) | null = null; onwaiting: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null; ondurationchange: (() => void) | null = null; onloadedmetadata: (() => void) | null = null;
  playGate: ReturnType<typeof deferred<void>> | null = null;
  plays = 0;
  async play() { this.plays++; if (this.playGate) await this.playGate.promise; this.paused = false; this.onplaying?.(); }
  pause() { this.paused = true; this.onpause?.(); }
  load() { if (this.src) this.onloadedmetadata?.(); }
  removeAttribute() { this.src = ''; }
}
function setup(resolve?: (s: MusicSong, signal: AbortSignal) => Promise<SongSource>, gate?: ReturnType<typeof deferred<void>>) {
  const media: FakeAudio[] = [];
  const player = new MusicPlayback(resolve ?? (async () => ({ url: 'https://example.test/audio.mp3' })), () => {
    const audio = new FakeAudio(); audio.playGate = gate ?? null; media.push(audio); return audio as unknown as HTMLAudioElement;
  });
  return { player, media };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('pause while resolving a source prevents later autoplay, then resume uses the loaded source', async () => {
  const source = deferred<SongSource>(); const { player, media } = setup(() => source.promise);
  const started = player.play(songs[0], songs); player.pause();
  source.resolve({ url: 'https://example.test/a' }); await started;
  assert.equal(media[0].plays, 0); assert.equal(player.getSnapshot().status, 'paused');
  player.toggle(); await tick(); assert.equal(player.getSnapshot().status, 'playing');
});
test('late source responses cannot replace the latest track or artwork', async () => {
  const pending = [deferred<SongSource>(), deferred<SongSource>()];
  const { player, media } = setup(s => pending[s.id === 'A' ? 0 : 1].promise);
  const a = player.play(songs[0], songs); const b = player.play(songs[1], songs);
  pending[1].resolve({ url: 'https://example.test/b', song: { ...songs[1], coverUrl: 'https://example.test/b.jpg' } }); await b;
  pending[0].resolve({ url: 'https://example.test/a', song: songs[0] }); await a;
  assert.equal(player.getSnapshot().song?.id, 'B'); assert.equal(media.length, 1);
  assert.equal(player.getSnapshot().song?.coverUrl, 'https://example.test/b.jpg');
});
test('rapid next/previous clicks use synchronous track selection and preserve the queue', async () => {
  const { player } = setup(); await player.play(songs[0], songs);
  player.skip(1); player.skip(1); assert.equal(player.getSnapshot().song?.id, 'C');
  player.skip(-1); assert.equal(player.getSnapshot().song?.id, 'B'); await tick();
  assert.deepEqual(player.getSnapshot().queue.map(s => s.id), ['A', 'B', 'C']);
});
test('pausing an unresolved play promise cannot later switch the UI to playing', async () => {
  const gate = deferred<void>(); const { player, media } = setup(undefined, gate);
  const started = player.play(songs[0]); await tick(); player.pause(); gate.resolve(); await started;
  assert.equal(player.getSnapshot().wantsPlayback, false); assert.equal(media[0].paused, true); assert.equal(player.getSnapshot().status, 'paused');
});
test('a late play failure from the prior track cannot mark the new track failed', async () => {
  const gate = deferred<void>(); const { player, media } = setup(undefined, gate);
  const a = player.play(songs[0], songs); await tick();
  const b = player.play(songs[1], songs); await tick(); media[1].playGate = null;
  gate.reject(new Error('old failure')); await a; await b;
  // Retry the current track; old promise has no further influence.
  player.toggle(); await tick(); assert.equal(player.getSnapshot().song?.id, 'B');
});
test('same URL for different tracks still loads the new selection; old media events are detached', async () => {
  const { player, media } = setup(); await player.play(songs[0], songs);
  const lateError = media[0].onerror; await player.play(songs[1], songs); lateError?.();
  assert.equal(media.length, 2); assert.equal(media[0].src, ''); assert.equal(player.getSnapshot().status, 'playing');
});
test('unavailable source stops with an actionable error and can be retried', async () => {
  let attempts = 0; const { player } = setup(async () => ({ url: ++attempts === 1 ? null : 'https://example.test/a' }));
  await player.play(songs[0], songs); assert.equal(player.getSnapshot().status, 'error');
  assert.equal(player.getSnapshot().wantsPlayback, false); player.toggle(); await tick();
  assert.equal(attempts, 2); assert.equal(player.getSnapshot().status, 'playing');
});
test('media failure ends the pending playback intent and retry fetches a fresh URL', async () => {
  let attempts = 0; const { player, media } = setup(async () => ({ url: `https://example.test/${++attempts}` }));
  await player.play(songs[0]); media[0].error = { code: 2 }; media[0].onerror?.();
  assert.equal(player.getSnapshot().status, 'error'); player.toggle(); await tick(); assert.equal(attempts, 2);
});
test('autoplay rejection preserves the source for the next user gesture', async () => {
  const gate = deferred<void>(); const { player, media } = setup(undefined, gate);
  const started = player.play(songs[0]); await tick(); gate.reject(new DOMException('blocked', 'NotAllowedError')); await started;
  assert.equal(player.getSnapshot().status, 'paused'); media[0].playGate = null; player.toggle(); await tick();
  assert.equal(media.length, 1); assert.equal(player.getSnapshot().status, 'playing');
});
test('ended advances once, loops a one-song queue, and unavailable next stops instead of spinning', async () => {
  const { player, media } = setup(async s => ({ url: s.id === 'B' ? null : 'https://example.test/a' }));
  await player.play(songs[0], songs); media[0].ended = true; media[0].onended?.(); await tick();
  assert.equal(player.getSnapshot().song?.id, 'B'); assert.equal(player.getSnapshot().status, 'error');
  await player.play(songs[0]); media[1].onended?.(); await tick(); assert.equal(player.getSnapshot().song?.id, 'A'); assert.equal(media.length, 3);
});
test('unmute at zero restores audible volume and seeking is clamped', async () => {
  const { player, media } = setup(); await player.play(songs[0]); player.setVolume(0); player.toggleMute();
  assert.equal(media[0].muted, false); assert.ok(media[0].volume > 0);
  player.seek(999); assert.equal(media[0].currentTime, 90); player.seek(-5); assert.equal(media[0].currentTime, 0);
});
test('teardown cancels pending source requests and never starts audio after unmount', async () => {
  const source = deferred<SongSource>(); const { player, media } = setup(() => source.promise);
  const started = player.play(songs[0]); player.destroy(); source.resolve({ url: 'https://example.test/a' }); await started;
  assert.equal(media.length, 0);
});
test('server detail enriches artwork but cannot substitute a different song', async () => {
  const { player } = setup(async () => ({ url: 'https://example.test/a', song: songs[1], trial: true }));
  await player.play(songs[0]); assert.equal(player.getSnapshot().song?.id, 'A'); assert.equal(player.getSnapshot().trial, true);
});

test('a native media pause synchronizes intent, while an old queued pause cannot override resume', async () => {
  const { player, media } = setup(); await player.play(songs[0]);
  media[0].pause(); assert.equal(player.getSnapshot().wantsPlayback, false);
  player.toggle(); await tick(); media[0].onpause?.();
  assert.equal(player.getSnapshot().wantsPlayback, true); assert.equal(player.getSnapshot().status, 'playing');
});
test('switching site accounts clears playback and cancels late resolutions while retaining volume', async () => {
  const source = deferred<SongSource>(); const { player, media } = setup(() => source.promise);
  player.setVolume(0.4); const started = player.play(songs[0], songs); player.clear(); source.resolve({ url: 'https://example.test/a' }); await started;
  assert.equal(media.length, 0); assert.equal(player.getSnapshot().song, null); assert.equal(player.getSnapshot().queue.length, 0); assert.equal(player.getSnapshot().volume, 0.4);
});
