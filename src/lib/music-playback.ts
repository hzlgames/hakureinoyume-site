import type { MusicSong, SongSource } from './music-types';

export type PlaybackState = {
  song: MusicSong | null;
  queue: MusicSong[];
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error';
  wantsPlayback: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  trial: boolean;
  error: string | null;
};
const initialState: PlaybackState = {
  song: null, queue: [], status: 'idle', wantsPlayback: false,
  progress: 0, duration: 0, volume: 0.82, muted: false, trial: false, error: null
};

/** Owns playback intent and the media element. Browsing never changes this queue. */
export class MusicPlayback {
  private state = initialState;
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private request = 0;
  private playAttempt = 0;
  private controller: AbortController | null = null;
  private expiresAt = 0;
  constructor(
    private resolveSource: (song: MusicSong, signal: AbortSignal) => Promise<SongSource>,
    private createAudio: () => HTMLAudioElement = () => new Audio()
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private releaseAudio() {
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    audio.onplaying = audio.onpause = audio.onended = audio.onerror = audio.onwaiting = null;
    audio.ontimeupdate = audio.ondurationchange = audio.onloadedmetadata = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  private fail(message: string) {
    this.playAttempt++;
    this.audio?.pause();
    this.update({ status: 'error', wantsPlayback: false, error: message });
  }
  play = async (song: MusicSong, queue: MusicSong[] = [song]) => {
    const request = ++this.request;
    this.playAttempt++;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.releaseAudio();
    this.update({ song, queue: queue.some(item => item.id === song.id) ? [...queue] : [song], status: 'loading', wantsPlayback: true, progress: 0, duration: 0, error: null, trial: false });
    try {
      const source = await this.resolveSource(song, controller.signal);
      if (request !== this.request || controller.signal.aborted) return;
      if (!source.url) {
        this.fail('这首歌暂无可用音源，可能受版权、会员或地区限制。可重试或切换下一首。');
        return;
      }
      const audio = this.createAudio();
      this.audio = audio;
      const current = () => this.audio === audio && request === this.request;
      audio.preload = 'auto';
      audio.volume = this.state.volume;
      audio.muted = this.state.muted;
      audio.onplaying = () => {
        if (!current()) return;
        if (!this.state.wantsPlayback) { audio.pause(); return; }
        this.update({ status: 'playing', error: null });
      };
      audio.onpause = () => {
        if (current() && audio.paused && !audio.ended) {
          this.playAttempt++;
          this.update({ status: 'paused', wantsPlayback: false });
        }
      };
      audio.onwaiting = () => { if (current() && this.state.wantsPlayback) this.update({ status: 'buffering' }); };
      audio.ontimeupdate = () => { if (current()) this.update({ progress: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 }); };
      audio.ondurationchange = audio.onloadedmetadata = () => {
        if (current()) this.update({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
      };
      audio.onerror = () => {
        if (current()) this.fail(audio.error?.code === 2
          ? '音频连接中断，请点击重试以重新获取播放地址。'
          : '音频无法播放，请重试或切换下一首。');
      };
      audio.onended = () => { if (current() && this.state.wantsPlayback) this.skip(1); };
      this.expiresAt = source.expiresIn ? Date.now() + source.expiresIn * 1000 : 0;
      this.update({ song: source.song?.id === song.id ? source.song : song, trial: source.trial === true });
      audio.src = source.url;
      audio.load();
      if (this.state.wantsPlayback) await this.resume();
      else this.update({ status: 'paused' });
    } catch (error) {
      if (request !== this.request || controller.signal.aborted) return;
      this.fail(error instanceof Error ? error.message : '播放地址获取失败，请重试。');
    } finally {
      if (request === this.request) this.controller = null;
    }
  };
  private resume = async () => {
    const audio = this.audio;
    if (!audio) return;
    const attempt = ++this.playAttempt;
    this.update({ wantsPlayback: true, status: 'buffering', error: null });
    try {
      await audio.play();
      if (this.audio === audio && attempt === this.playAttempt && this.state.wantsPlayback) this.update({ status: 'playing' });
    } catch (error) {
      if (this.audio !== audio || attempt !== this.playAttempt || !this.state.wantsPlayback) return;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        this.update({ status: 'paused', wantsPlayback: false, error: '浏览器需要手动播放，请再点一次播放。' });
      } else {
        this.fail('音频启动失败，请重试。');
      }
    }
  };
  pause = () => {
    this.playAttempt++;
    this.update({ wantsPlayback: false, status: this.state.song ? 'paused' : 'idle' });
    this.audio?.pause();
  };
  toggle = () => {
    if (this.state.wantsPlayback) { this.pause(); return; }
    if (!this.state.song) return;
    if (this.state.status === 'error' || (!this.controller && (!this.audio || (this.expiresAt > 0 && Date.now() >= this.expiresAt)))) {
      void this.play(this.state.song, this.state.queue);
    } else if (this.audio) {
      void this.resume();
    } else {
      this.update({ wantsPlayback: true, status: 'loading' });
    }
  };
  skip = (offset: number) => {
    const { queue, song } = this.state;
    if (!song || !queue.length) return;
    const index = queue.findIndex(item => item.id === song.id);
    const next = queue[(Math.max(index, 0) + offset + queue.length) % queue.length];
    void this.play(next, queue);
  };
  seek = (value: number) => {
    if (!this.audio || !Number.isFinite(value) || !this.state.duration) return;
    const progress = Math.max(0, Math.min(value, this.state.duration));
    this.audio.currentTime = progress;
    this.update({ progress });
  };
  setVolume = (volume: number) => {
    if (!Number.isFinite(volume)) return;
    volume = Math.min(1, Math.max(0, volume));
    this.update({ volume, muted: volume === 0 });
    if (this.audio) { this.audio.volume = volume; this.audio.muted = volume === 0; }
  };
  toggleMute = () => {
    if (this.state.volume === 0) { this.setVolume(0.5); return; }
    const muted = !this.state.muted;
    this.update({ muted });
    if (this.audio) this.audio.muted = muted;
  };
  clear = () => {
    this.destroy();
    this.update({ ...initialState, volume: this.state.volume, muted: this.state.muted });
  };
  destroy = () => {
    this.request++;
    this.playAttempt++;
    this.controller?.abort();
    this.controller = null;
    this.releaseAudio();
  };
}
