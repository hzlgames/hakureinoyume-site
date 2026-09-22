'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MusicPlayback } from '../../../lib/music-playback';
import type { SongSource } from '../../../lib/music-types';
import { fetchJson } from './api';

export function usePlayback(siteUserId: string | undefined, onError: (error: unknown) => boolean) {
  const [player] = useState(() => new MusicPlayback(async (song, signal) => {
    try { return await fetchJson<SongSource>(`/api/music/song-url?id=${encodeURIComponent(song.id)}&level=higher`, { signal }); }
    catch (error) { if (!signal.aborted) onError(error); throw error; }
  }));
  const previousUser = useRef(siteUserId);
  useEffect(() => {
    if (previousUser.current !== siteUserId) player.clear();
    previousUser.current = siteUserId;
  }, [siteUserId, player]);
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  useEffect(() => {
    try {
      const value = localStorage.getItem('hakurei-music-volume');
      if (value !== null) player.setVolume(Number(value));
    } catch {}
    return player.destroy;
  }, [player]);
  useEffect(() => {
    try { localStorage.setItem('hakurei-music-volume', String(state.volume)); } catch {}
  }, [state.volume]);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const song = state.song;
    session.metadata = song ? new MediaMetadata({ title: song.name, artist: song.artists, album: song.album,
      artwork: song.coverUrl ? [{ src: song.coverUrl }] : [] }) : null;
    session.setActionHandler('play', () => { if (!player.getSnapshot().wantsPlayback) player.toggle(); });
    session.setActionHandler('pause', player.pause);
    session.setActionHandler('previoustrack', () => player.skip(-1));
    session.setActionHandler('nexttrack', () => player.skip(1));
    session.setActionHandler('seekto', event => { if (event.seekTime !== undefined) player.seek(event.seekTime); });
    return () => {
      session.metadata = null;
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const) session.setActionHandler(action, null);
    };
  }, [player, state.song]);
  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : 'paused';
  }, [state.status]);
  return { player, ...state };
}
