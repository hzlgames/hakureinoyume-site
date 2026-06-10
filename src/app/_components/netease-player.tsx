"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  ListMusic,
  LoaderCircle,
  LogIn,
  LogOut,
  Music,
  Pause,
  Play,
  RefreshCw,
  Search,
  SkipBack,
  SkipForward,
  UserRound
} from "lucide-react";
import { CardHeader, DashboardCard } from "./ui";

type NeteaseProfile = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
};

type AccountState = {
  siteAuthenticated: boolean;
  neteaseAuthenticated: boolean;
  profile: NeteaseProfile | null;
  expired?: boolean;
};

type MusicSong = {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  duration: number | null;
};

type MusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  trackCount: number;
  playCount: number;
};

type QrState = {
  key: string;
  qrimg: string;
  status: "waiting" | "scanned" | "expired" | "error";
  message: string;
};

const defaultAccount: AccountState = {
  siteAuthenticated: false,
  neteaseAuthenticated: false,
  profile: null
};

function formatDuration(value: number | null) {
  if (!value) return "--:--";
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatClock(value: number) {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {})
    }
  });
  const data = await response.json() as T & { message?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.message || data.error || "请求失败");
  }

  return data;
}

export function NeteasePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const qrRef = useRef<QrState | null>(null);
  const qrCheckInFlightRef = useRef(false);
  const qrResolvedRef = useRef(false);
  const playRequestIdRef = useRef(0);
  const [account, setAccount] = useState<AccountState>(defaultAccount);
  const [query, setQuery] = useState("东方Project");
  const [mode, setMode] = useState<"search" | "collection">("search");
  const [searchResults, setSearchResults] = useState<MusicSong[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<MusicPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<MusicSong[]>([]);
  const [queue, setQueue] = useState<MusicSong[]>([]);
  const [currentSong, setCurrentSong] = useState<MusicSong | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState("未登录网易云时，将使用公开/游客访问能力。");
  const [qr, setQr] = useState<QrState | null>(null);

  const visibleSongs = useMemo(
    () => mode === "search" ? searchResults : playlistTracks,
    [mode, playlistTracks, searchResults]
  );

  const loadAccount = useCallback(async () => {
    const data = await fetchJson<AccountState>(`/api/music/me?t=${Date.now()}`);
    setAccount(data);
    if (data.expired) {
      setMessage("网易云登录态已失效，请重新扫码登录。");
    }
    return data;
  }, []);

  const loadPlaylistsForAccount = useCallback(async (
    nextAccount: AccountState,
    options: { announce?: boolean } = {}
  ) => {
    if (!nextAccount.neteaseAuthenticated) {
      setPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      return [];
    }

    const data = await fetchJson<{ playlists: MusicPlaylist[] }>(`/api/music/playlists?t=${Date.now()}`);
    setPlaylists(data.playlists);

    if (options.announce) {
      setMessage(data.playlists.length > 0 ? "已读取网易云收藏歌单。" : "没有读取到收藏歌单。");
    }

    return data.playlists;
  }, []);

  const refreshMusicState = useCallback(async (
    options: { announce?: boolean; reloadPlaylists?: boolean } = {}
  ) => {
    setIsRefreshing(true);
    try {
      const nextAccount = await loadAccount();

      if (options.reloadPlaylists !== false) {
        await loadPlaylistsForAccount(nextAccount);
      }

      if (options.announce) {
        setMessage(nextAccount.neteaseAuthenticated ? "网易云状态已刷新。" : "当前未连接网易云账户。");
      }

      return nextAccount;
    } catch (error) {
      if (options.announce) {
        setMessage(error instanceof Error ? error.message : "状态刷新失败。");
      }
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [loadAccount, loadPlaylistsForAccount]);

  const runSearch = useCallback(async (nextQuery: string) => {
    const keyword = nextQuery.trim();
    if (!keyword) return;

    setIsLoading(true);
    try {
      const data = await fetchJson<{ songs: MusicSong[] }>(`/api/music/search?keywords=${encodeURIComponent(keyword)}&limit=24&t=${Date.now()}`);
      setSearchResults(data.songs);
      setMode("search");
      setMessage(data.songs.length > 0 ? "搜索结果已更新。" : "没有找到可展示的歌曲。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadPlaylistsForAccount(account, { announce: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "歌单读取失败。");
    } finally {
      setIsLoading(false);
    }
  }, [account, loadPlaylistsForAccount]);

  useEffect(() => {
    loadAccount().catch(() => setMessage("账号状态读取失败。"));
    runSearch("东方Project").catch(() => setMessage("默认搜索失败。"));
  }, [loadAccount, runSearch]);

  useEffect(() => {
    if (account.neteaseAuthenticated) {
      loadPlaylists().catch(() => setMessage("歌单读取失败。"));
    }
  }, [account.neteaseAuthenticated, loadPlaylists]);

  useEffect(() => {
    qrRef.current = qr;
  }, [qr]);

  useEffect(() => {
    if (!qr?.key) return;

    const key = qr.key;
    let isStopped = false;
    qrResolvedRef.current = false;

    const checkQrStatus = async () => {
      const currentQr = qrRef.current;

      if (
        isStopped
        || qrCheckInFlightRef.current
        || qrResolvedRef.current
        || !currentQr
        || currentQr.key !== key
        || currentQr.status === "expired"
        || currentQr.status === "error"
      ) {
        return;
      }

      qrCheckInFlightRef.current = true;
      try {
        const data = await fetchJson<{ code: number; message?: string; profile?: NeteaseProfile }>("/api/music/login/qr/check", {
          method: "POST",
          body: JSON.stringify({ key })
        });

        if (data.code === 803) {
          qrResolvedRef.current = true;
          setQr(null);
          setMessage(`网易云已连接${data.profile?.nickname ? `：${data.profile.nickname}` : ""}。`);
          await refreshMusicState({ reloadPlaylists: true });
          return;
        }

        if (data.code === 802) {
          setQr((current) => current ? { ...current, status: "scanned", message: "已扫码，请在网易云确认登录。" } : current);
        } else if (data.code === 800) {
          setQr((current) => current ? { ...current, status: "expired", message: "二维码已过期，请重新生成。" } : current);
        }
      } catch (error) {
        setQr((current) => current ? {
          ...current,
          status: "error",
          message: error instanceof Error ? error.message : "登录状态检查失败。"
        } : current);
      } finally {
        qrCheckInFlightRef.current = false;
      }
    };

    checkQrStatus();
    const timer = window.setInterval(checkQrStatus, 1400);

    return () => {
      isStopped = true;
      window.clearInterval(timer);
    };
  }, [qr?.key, refreshMusicState]);

  const resetAudioElement = useCallback(() => {
    const audio = audioRef.current;

    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
    setProgress(0);
    setDuration(0);
  }, []);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(query).catch(() => setMessage("搜索失败。"));
  };

  const startQrLogin = async () => {
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号，再绑定你的网易云账户。");
      return;
    }

    setIsLoading(true);
    setQr(null);
    setMessage("正在生成新的网易云登录二维码。");
    try {
      const data = await fetchJson<{ key: string; qrimg: string }>("/api/music/login/qr/start", {
        method: "POST",
        body: JSON.stringify({})
      });
      qrResolvedRef.current = false;
      setQr({
        key: data.key,
        qrimg: data.qrimg,
        status: "waiting",
        message: "请使用网易云音乐扫码登录。"
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "二维码生成失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsLoading(true);
    try {
      await fetchJson("/api/music/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
      setQr(null);
      setAccount((current) => ({ ...current, neteaseAuthenticated: false, profile: null }));
      setPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      await refreshMusicState({ reloadPlaylists: false });
      setMessage("已断开网易云账户。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "断开失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlaylistTracks = async (playlist: MusicPlaylist) => {
    setSelectedPlaylist(playlist);
    setMode("collection");
    setIsLoading(true);

    try {
      const data = await fetchJson<{ songs: MusicSong[] }>(`/api/music/playlist?id=${encodeURIComponent(playlist.id)}&t=${Date.now()}`);
      setPlaylistTracks(data.songs);
      setQueue(data.songs);
      setMessage(`已载入 ${playlist.name}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "歌单歌曲读取失败。");
    } finally {
      setIsLoading(false);
    }
  };

  const playSong = async (song: MusicSong, nextQueue = visibleSongs) => {
    const requestId = playRequestIdRef.current + 1;
    playRequestIdRef.current = requestId;

    resetAudioElement();
    setCurrentSong(song);
    setCurrentUrl(null);
    setIsPlaying(false);
    setQueue(nextQueue.length > 0 ? nextQueue : [song]);
    setIsLoading(true);

    try {
      const data = await fetchJson<{ url: string | null }>(`/api/music/song-url?id=${encodeURIComponent(song.id)}&level=higher&t=${Date.now()}`);

      if (requestId !== playRequestIdRef.current) {
        return;
      }

      if (!data.url) {
        setMessage("这首歌当前没有可用播放链接，可能受版权、VIP 或地区限制。");
        return;
      }

      setCurrentUrl(data.url);
      setMessage(`正在播放：${song.name}`);

      const audio = audioRef.current;
      if (!audio) return;

      audio.pause();
      audio.src = data.url;
      audio.currentTime = 0;
      audio.load();

      try {
        await audio.play();

        if (requestId === playRequestIdRef.current) {
          setIsPlaying(true);
        }
      } catch {
        if (requestId === playRequestIdRef.current) {
          setIsPlaying(false);
          setMessage("浏览器阻止了自动播放，请手动点击播放。");
        }
      }
    } catch (error) {
      if (requestId === playRequestIdRef.current) {
        setMessage(error instanceof Error ? error.message : "播放链接获取失败。");
      }
    } finally {
      if (requestId === playRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const playByOffset = (offset: number) => {
    if (!currentSong || queue.length === 0) return;
    const index = queue.findIndex((song) => song.id === currentSong.id);
    const next = queue[(index + offset + queue.length) % queue.length];
    if (next) playSong(next, queue).catch(() => setMessage("切歌失败。"));
  };

  const togglePlayback = () => {
    if (!currentSong && visibleSongs[0]) {
      playSong(visibleSongs[0], visibleSongs).catch(() => setMessage("播放失败。"));
      return;
    }

    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      if (!audioRef.current.currentSrc && currentUrl) {
        audioRef.current.src = currentUrl;
        audioRef.current.load();
      }

      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setMessage("播放失败。"));
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (value: number) => {
    const audio = audioRef.current;
    const nextTime = Math.min(Math.max(value, 0), Number.isFinite(duration) ? duration : 0);

    setProgress(nextTime);

    if (audio && Number.isFinite(nextTime)) {
      audio.currentTime = nextTime;
    }
  };

  const progressPercent = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;
  const canSeek = duration > 0 && Number.isFinite(duration);
  const coverUrl = currentSong?.coverUrl || account.profile?.avatarUrl || "https://placeholder.co/140x140";

  return (
    <DashboardCard className="netease-player">
      <CardHeader
        action={
          isLoading ? <LoaderCircle className="netease-spin" size={16} /> : <Music size={16} color="var(--text-tertiary)" />
        }
        icon={<Music className="card-title-icon" size={18} />}
        title="网易云音乐"
      />

      <audio
        ref={audioRef}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => playByOffset(1)}
      />

      <div className="netease-account">
        <div className="netease-account-main">
          {account.neteaseAuthenticated && account.profile ? (
            <>
              <div className="netease-avatar">
                {account.profile.avatarUrl ? (
                  <Image src={account.profile.avatarUrl} alt={account.profile.nickname} width={34} height={34} />
                ) : (
                  <UserRound size={18} />
                )}
              </div>
              <div>
                <div className="netease-account-name">{account.profile.nickname}</div>
                <div className="netease-account-note">收藏歌单已启用</div>
              </div>
            </>
          ) : (
            <>
              <div className="netease-avatar"><UserRound size={18} /></div>
              <div>
                <div className="netease-account-name">公开访问</div>
                <div className="netease-account-note">可搜索，收藏需连接网易云</div>
              </div>
            </>
          )}
        </div>
        <div className="netease-account-actions">
          <button
            className="netease-icon-btn"
            type="button"
            onClick={() => refreshMusicState({ announce: true }).catch(() => undefined)}
            disabled={isRefreshing}
            aria-label="刷新网易云状态"
            title="刷新网易云状态"
          >
            <RefreshCw className={isRefreshing ? "netease-spin" : undefined} size={16} />
          </button>
          {account.neteaseAuthenticated ? (
            <button className="netease-icon-btn" type="button" onClick={disconnect} disabled={isLoading} aria-label="断开网易云">
              <LogOut size={16} />
            </button>
          ) : account.siteAuthenticated ? (
            <button className="netease-connect-btn" type="button" onClick={startQrLogin} disabled={isLoading}>
              <LogIn size={14} /> 连接
            </button>
          ) : (
            <Link className="netease-connect-btn" href="/login">
              <LogIn size={14} /> 登录本站
            </Link>
          )}
        </div>
      </div>

      {qr ? (
        <div className="netease-qr-panel">
          {qr.qrimg ? <Image key={qr.key} src={qr.qrimg} alt="网易云二维码" width={160} height={160} /> : null}
          <div className="netease-qr-message">{qr.message}</div>
          <button className="netease-connect-btn" type="button" onClick={startQrLogin}>
            <RefreshCw size={14} /> 重新生成
          </button>
        </div>
      ) : null}

      <div className="netease-now">
        <div className="netease-cover">
          <div className="netease-vinyl" />
          <Image src={coverUrl} alt={currentSong?.name ?? "网易云音乐"} width={116} height={116} />
        </div>
        <div className="netease-current">
          <div className="netease-song-title">{currentSong?.name ?? "选择一首歌"}</div>
          <div className="netease-song-artist">{currentSong?.artists ?? "搜索或打开收藏歌单后播放"}</div>
          <div className="netease-controls">
            <button className="music-btn" type="button" onClick={() => playByOffset(-1)} aria-label="上一首">
              <SkipBack size={16} />
            </button>
            <button className="music-btn play" type="button" onClick={togglePlayback} aria-label={isPlaying ? "暂停" : "播放"}>
              {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
            </button>
            <button className="music-btn" type="button" onClick={() => playByOffset(1)} aria-label="下一首">
              <SkipForward size={16} />
            </button>
          </div>
          <div className="music-progress">
            <span>{formatClock(progress)}</span>
            <div className="music-seek-wrap">
              <div className="music-bar" aria-hidden="true">
                <div className="music-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <input
                aria-label="调整播放进度"
                className="music-seek"
                disabled={!canSeek}
                max={canSeek ? duration : 0}
                min={0}
                onChange={(event) => seekTo(Number(event.currentTarget.value))}
                step={0.1}
                type="range"
                value={canSeek ? Math.min(progress, duration) : 0}
              />
            </div>
            <span>{formatClock(duration)}</span>
          </div>
        </div>
      </div>

      <form className="netease-search" onSubmit={submitSearch}>
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索歌曲、歌手"
        />
        <button type="submit">搜索</button>
      </form>

      <div className="netease-tabs">
        <button className={mode === "search" ? "active" : ""} type="button" onClick={() => setMode("search")}>
          <Search size={14} /> 搜索
        </button>
        <button className={mode === "collection" ? "active" : ""} type="button" onClick={() => setMode("collection")}>
          <Heart size={14} /> 收藏
        </button>
      </div>

      {mode === "collection" ? (
        <div className="netease-playlists">
          {account.neteaseAuthenticated ? playlists.map((playlist) => (
            <button
              className={`netease-playlist ${selectedPlaylist?.id === playlist.id ? "active" : ""}`}
              key={playlist.id}
              type="button"
              onClick={() => loadPlaylistTracks(playlist)}
            >
              <ListMusic size={15} />
              <span>{playlist.name}</span>
              <small>{playlist.trackCount}</small>
            </button>
          )) : (
            <div className="netease-empty">连接网易云后可查看收藏歌单。</div>
          )}
        </div>
      ) : null}

      <div className="netease-list" aria-label="歌曲列表">
        {visibleSongs.map((song) => (
          <button
            className={`netease-track ${currentSong?.id === song.id ? "active" : ""}`}
            key={song.id}
            type="button"
            onClick={() => playSong(song, visibleSongs)}
          >
            <span className="netease-track-name">{song.name}</span>
            <span className="netease-track-artist">{song.artists}</span>
            <span className="netease-track-time">{formatDuration(song.duration)}</span>
          </button>
        ))}
        {visibleSongs.length === 0 ? <div className="netease-empty">{message}</div> : null}
      </div>

      <div className="netease-status">{message}</div>
    </DashboardCard>
  );
}
