"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Album,
  Heart,
  HeartPlus,
  GripVertical,
  ListMusic,
  ListPlus,
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
  Trash2,
  UserRound,
  Volume2,
  VolumeX
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
  rowId?: string;
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  duration: number | null;
  addedAt?: string;
};

type MusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  trackCount: number;
  playCount: number;
};

type MusicAlbum = {
  id: string;
  name: string;
  artists: string;
  coverUrl: string | null;
  trackCount: number;
  publishTime: number | null;
  company: string | null;
};

type QrState = {
  key: string;
  qrimg: string;
  status: "waiting" | "scanned" | "expired" | "error";
  message: string;
};

type WebPlaylistState = {
  playlist: {
    id: string;
    name: string;
    trackCount: number;
  };
  songs: MusicSong[];
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
  const playAbortControllerRef = useRef<AbortController | null>(null);
  const autoplayRequestIdRef = useRef<number | null>(null);
  const neteasePlaylistsRequestIdRef = useRef(0);
  const playlistTracksRequestIdRef = useRef(0);
  const webPlaylistRequestIdRef = useRef(0);
  const refreshRequestIdRef = useRef(0);
  const albumRequestIdRef = useRef(0);
  const [account, setAccount] = useState<AccountState>(defaultAccount);
  const [query, setQuery] = useState("东方Project");
  const [mode, setMode] = useState<"search" | "web" | "netease">("search");
  const [searchType, setSearchType] = useState<"songs" | "albums">("songs");
  const [searchResults, setSearchResults] = useState<MusicSong[]>([]);
  const [albumResults, setAlbumResults] = useState<MusicAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<MusicAlbum | null>(null);
  const [albumTracks, setAlbumTracks] = useState<MusicSong[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<MusicPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<MusicSong[]>([]);
  const [webPlaylist, setWebPlaylist] = useState<WebPlaylistState["playlist"] | null>(null);
  const [webPlaylistSongs, setWebPlaylistSongs] = useState<MusicSong[]>([]);
  const [queue, setQueue] = useState<MusicSong[]>([]);
  const [currentSong, setCurrentSong] = useState<MusicSong | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNeteasePlaylistsLoading, setIsNeteasePlaylistsLoading] = useState(false);
  const [isPlaylistTracksLoading, setIsPlaylistTracksLoading] = useState(false);
  const [isWebPlaylistLoading, setIsWebPlaylistLoading] = useState(false);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [pendingSongIds, setPendingSongIds] = useState<string[]>([]);
  const [neteaseLikedSongIds, setNeteaseLikedSongIds] = useState<string[]>([]);
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [message, setMessage] = useState("未登录网易云时，将使用公开/游客访问能力。");
  const [qr, setQr] = useState<QrState | null>(null);

  const visibleSongs = useMemo(
    () => {
      if (mode === "web") return webPlaylistSongs;
      if (mode === "netease") return playlistTracks;
      if (searchType === "albums") return albumTracks;
      return searchResults;
    },
    [albumTracks, mode, playlistTracks, searchResults, searchType, webPlaylistSongs]
  );
  const webSongIds = useMemo(() => new Set(webPlaylistSongs.map((song) => song.id)), [webPlaylistSongs]);
  const neteaseLikedIds = useMemo(() => new Set(neteaseLikedSongIds), [neteaseLikedSongIds]);
  const pendingIds = useMemo(() => new Set(pendingSongIds), [pendingSongIds]);
  const playerBusy = isLoading || isNeteasePlaylistsLoading || isPlaylistTracksLoading || isWebPlaylistLoading || isAlbumLoading;

  const markSongPending = useCallback((songId: string, pending: boolean) => {
    setPendingSongIds((current) => {
      if (pending) {
        return current.includes(songId) ? current : [...current, songId];
      }

      return current.filter((id) => id !== songId);
    });
  }, []);

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
    const requestId = neteasePlaylistsRequestIdRef.current + 1;
    neteasePlaylistsRequestIdRef.current = requestId;

    if (!nextAccount.neteaseAuthenticated) {
      setPlaylists([]);
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
      return [];
    }

    setIsNeteasePlaylistsLoading(true);
    try {
      const data = await fetchJson<{ playlists: MusicPlaylist[] }>(`/api/music/playlists?t=${Date.now()}`);

      if (requestId !== neteasePlaylistsRequestIdRef.current) return [];

      setPlaylists(data.playlists);

      if (options.announce) {
        setMessage(data.playlists.length > 0 ? "已读取网易云收藏歌单。" : "没有读取到收藏歌单。");
      }

      return data.playlists;
    } finally {
      if (requestId === neteasePlaylistsRequestIdRef.current) {
        setIsNeteasePlaylistsLoading(false);
      }
    }
  }, []);

  const loadWebPlaylist = useCallback(async (options: { announce?: boolean } = {}) => {
    const requestId = webPlaylistRequestIdRef.current + 1;
    webPlaylistRequestIdRef.current = requestId;
    setIsWebPlaylistLoading(true);

    try {
      const data = await fetchJson<WebPlaylistState>(`/api/music/web-playlist?t=${Date.now()}`);

      if (requestId !== webPlaylistRequestIdRef.current) return data;

      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);

      if (options.announce) {
        setMessage(data.songs.length > 0 ? "网页歌单已刷新。" : "网页歌单还是空的。");
      }

      return data;
    } catch (error) {
      if (requestId === webPlaylistRequestIdRef.current) {
        setMessage(error instanceof Error ? error.message : "网页歌单读取失败。");
        setWebPlaylist(null);
        setWebPlaylistSongs([]);
      }
      throw error;
    } finally {
      if (requestId === webPlaylistRequestIdRef.current) {
        setIsWebPlaylistLoading(false);
      }
    }
  }, []);

  const refreshMusicState = useCallback(async (
    options: { announce?: boolean; reloadPlaylists?: boolean } = {}
  ) => {
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setIsRefreshing(true);
    try {
      const nextAccount = await loadAccount();

      if (requestId !== refreshRequestIdRef.current) {
        return nextAccount;
      }

      if (nextAccount.siteAuthenticated) {
        await loadWebPlaylist();
      }

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
      if (requestId === refreshRequestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [loadAccount, loadPlaylistsForAccount, loadWebPlaylist]);

  const runSearch = useCallback(async (nextQuery: string, nextType = searchType) => {
    const keyword = nextQuery.trim();
    if (!keyword) return;

    setIsLoading(true);
    try {
      if (nextType === "albums") {
        const data = await fetchJson<{ albums: MusicAlbum[] }>(`/api/music/search?keywords=${encodeURIComponent(keyword)}&type=album&limit=16&t=${Date.now()}`);
        setAlbumResults(data.albums);
        setSelectedAlbum(null);
        setAlbumTracks([]);
        setMode("search");
        setMessage(data.albums.length > 0 ? "专辑搜索结果已更新。" : "没有找到可展示的专辑。");
        return;
      }

      const data = await fetchJson<{ songs: MusicSong[] }>(`/api/music/search?keywords=${encodeURIComponent(keyword)}&type=song&limit=24&t=${Date.now()}`);
      setSearchResults(data.songs);
      setMode("search");
      setMessage(data.songs.length > 0 ? "搜索结果已更新。" : "没有找到可展示的歌曲。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "搜索失败。");
    } finally {
      setIsLoading(false);
    }
  }, [searchType]);

  const loadPlaylists = useCallback(async () => {
    try {
      await loadPlaylistsForAccount(account, { announce: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "歌单读取失败。");
    }
  }, [account, loadPlaylistsForAccount]);

  useEffect(() => {
    loadAccount().then((nextAccount) => {
      if (nextAccount.siteAuthenticated) {
        loadWebPlaylist().catch(() => undefined);
      }

      if (nextAccount.neteaseAuthenticated) {
        loadPlaylistsForAccount(nextAccount).catch(() => undefined);
      }
    }).catch(() => setMessage("账号状态读取失败。"));
    runSearch("东方Project", "songs").catch(() => setMessage("默认搜索失败。"));
  }, [loadAccount, loadPlaylistsForAccount, loadWebPlaylist, runSearch]);

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

  useEffect(() => {
    return () => {
      playAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const requestId = playRequestIdRef.current;

    if (!audio) return;

    audio.pause();

    if (!currentUrl) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = currentUrl;
    audio.currentTime = 0;
    audio.load();

    if (autoplayRequestIdRef.current !== requestId) return;

    audio.play().then(() => {
      if (playRequestIdRef.current === requestId) {
        setIsPlaying(true);
      }
    }).catch((error) => {
      if (playRequestIdRef.current !== requestId) return;

      setIsPlaying(false);
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessage("浏览器阻止了自动播放，请手动点击播放。");
    });
  }, [currentUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = Math.min(Math.max(volume, 0), 1);
    audio.muted = isMuted || volume === 0;
  }, [isMuted, volume]);

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
    const requestId = playlistTracksRequestIdRef.current + 1;
    playlistTracksRequestIdRef.current = requestId;
    setSelectedPlaylist(playlist);
    setMode("netease");
    setPlaylistTracks([]);
    setIsPlaylistTracksLoading(true);
    setMessage(`正在载入 ${playlist.name}。`);

    try {
      const data = await fetchJson<{ songs: MusicSong[] }>(`/api/music/playlist?id=${encodeURIComponent(playlist.id)}&t=${Date.now()}`);

      if (requestId !== playlistTracksRequestIdRef.current) return;

      setPlaylistTracks(data.songs);
      setQueue(data.songs);
      setMessage(`已载入 ${playlist.name}。`);
    } catch (error) {
      if (requestId === playlistTracksRequestIdRef.current) {
        setMessage(error instanceof Error ? error.message : "歌单歌曲读取失败。");
      }
    } finally {
      if (requestId === playlistTracksRequestIdRef.current) {
        setIsPlaylistTracksLoading(false);
      }
    }
  };

  const loadAlbumTracks = async (album: MusicAlbum) => {
    const requestId = albumRequestIdRef.current + 1;
    albumRequestIdRef.current = requestId;
    setSelectedAlbum(album);
    setAlbumTracks([]);
    setMode("search");
    setSearchType("albums");
    setIsAlbumLoading(true);
    setMessage(`正在载入专辑：${album.name}`);

    try {
      const data = await fetchJson<{ album: MusicAlbum | null; songs: MusicSong[] }>(`/api/music/album?id=${encodeURIComponent(album.id)}&t=${Date.now()}`);

      if (requestId !== albumRequestIdRef.current) return;

      setSelectedAlbum(data.album ?? album);
      setAlbumTracks(data.songs);
      setQueue(data.songs);
      setMessage(data.songs.length > 0 ? `已载入专辑：${album.name}` : "这张专辑没有可展示的曲目。");
    } catch (error) {
      if (requestId === albumRequestIdRef.current) {
        setMessage(error instanceof Error ? error.message : "专辑曲目读取失败。");
      }
    } finally {
      if (requestId === albumRequestIdRef.current) {
        setIsAlbumLoading(false);
      }
    }
  };

  const addSongToWebPlaylist = async (song: MusicSong) => {
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号，再添加到网页歌单。");
      return;
    }

    markSongPending(song.id, true);
    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/tracks", {
        method: "POST",
        body: JSON.stringify({ song })
      });
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已加入网页歌单：${song.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加入网页歌单失败。");
    } finally {
      markSongPending(song.id, false);
    }
  };

  const removeSongFromWebPlaylist = async (song: MusicSong) => {
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号。");
      return;
    }

    markSongPending(song.id, true);
    try {
      const data = await fetchJson<WebPlaylistState>(`/api/music/web-playlist/tracks?id=${encodeURIComponent(song.id)}`, {
        method: "DELETE"
      });
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已从网页歌单移除：${song.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移除网页歌单歌曲失败。");
    } finally {
      markSongPending(song.id, false);
    }
  };

  const addSongsToWebPlaylist = async (songs: MusicSong[], label: string) => {
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号，再添加到网页歌单。");
      return;
    }

    const songsToAdd = songs.filter((song) => !webSongIds.has(song.id));
    if (songsToAdd.length === 0) {
      setMessage("这些歌曲已经在网页歌单中。");
      return;
    }

    setPendingSongIds((current) => Array.from(new Set([...current, ...songsToAdd.map((song) => song.id)])));
    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/tracks", {
        method: "POST",
        body: JSON.stringify({ songs: songsToAdd })
      });
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已加入网页歌单：${label}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量加入网页歌单失败。");
    } finally {
      setPendingSongIds((current) => current.filter((id) => !songsToAdd.some((song) => song.id === id)));
    }
  };

  const reorderWebPlaylist = async (fromId: string, toId: string) => {
    if (fromId === toId) return;

    const fromIndex = webPlaylistSongs.findIndex((song) => song.id === fromId);
    const toIndex = webPlaylistSongs.findIndex((song) => song.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextSongs = [...webPlaylistSongs];
    const [moved] = nextSongs.splice(fromIndex, 1);
    nextSongs.splice(toIndex, 0, moved);
    setWebPlaylistSongs(nextSongs);
    setDraggingSongId(null);

    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: nextSongs.map((song) => song.id) })
      });
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage("网页歌单顺序已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网页歌单排序保存失败。");
      loadWebPlaylist().catch(() => undefined);
    }
  };

  const likeSongOnNetease = async (song: MusicSong) => {
    if (!account.neteaseAuthenticated) {
      setMessage("请先连接网易云账户，再收藏到网易云。");
      return;
    }

    markSongPending(song.id, true);
    try {
      await fetchJson<{ ok: boolean }>("/api/music/like", {
        method: "POST",
        body: JSON.stringify({ id: song.id, like: true })
      });
      setNeteaseLikedSongIds((current) => current.includes(song.id) ? current : [...current, song.id]);
      setMessage(`已收藏到网易云：${song.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网易云收藏失败。");
    } finally {
      markSongPending(song.id, false);
    }
  };

  const playSong = async (song: MusicSong, nextQueue = visibleSongs) => {
    const requestId = playRequestIdRef.current + 1;
    playRequestIdRef.current = requestId;
    playAbortControllerRef.current?.abort();

    const controller = new AbortController();
    playAbortControllerRef.current = controller;
    autoplayRequestIdRef.current = requestId;

    resetAudioElement();
    setCurrentSong(song);
    setCurrentUrl(null);
    setIsPlaying(false);
    setQueue(nextQueue.length > 0 ? nextQueue : [song]);
    setIsLoading(true);

    try {
      const data = await fetchJson<{ url: string | null }>(
        `/api/music/song-url?id=${encodeURIComponent(song.id)}&level=higher&t=${Date.now()}`,
        { signal: controller.signal }
      );

      if (requestId !== playRequestIdRef.current || controller.signal.aborted) {
        return;
      }

      if (!data.url) {
        autoplayRequestIdRef.current = null;
        setMessage("这首歌当前没有可用播放链接，可能受版权、VIP 或地区限制。");
        return;
      }

      setCurrentUrl(data.url);
      setMessage(`正在播放：${song.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (requestId === playRequestIdRef.current) {
        setMessage(error instanceof Error ? error.message : "播放链接获取失败。");
      }
    } finally {
      if (playAbortControllerRef.current === controller) {
        playAbortControllerRef.current = null;
      }

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
          playerBusy ? <LoaderCircle className="netease-spin" size={16} /> : <Music size={16} color="var(--text-tertiary)" />
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
            <div className="music-volume">
              <button
                className="music-btn"
                type="button"
                onClick={() => setIsMuted((current) => !current)}
                aria-label={isMuted || volume === 0 ? "取消静音" : "静音"}
                title={isMuted || volume === 0 ? "取消静音" : "静音"}
              >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                aria-label="调整音量"
                className="music-volume-range"
                max={1}
                min={0}
                onChange={(event) => {
                  const nextVolume = Number(event.currentTarget.value);
                  setVolume(nextVolume);
                  setIsMuted(nextVolume === 0);
                }}
                step={0.01}
                type="range"
                value={isMuted ? 0 : volume}
              />
            </div>
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
          placeholder={searchType === "albums" ? "搜索专辑、艺人" : "搜索歌曲、歌手"}
        />
        <button type="submit">搜索</button>
      </form>

      <div className="netease-search-types" aria-label="搜索类型">
        <button
          className={searchType === "songs" ? "active" : ""}
          type="button"
          onClick={() => {
            setSearchType("songs");
            setMode("search");
            runSearch(query, "songs").catch(() => setMessage("搜索失败。"));
          }}
        >
          <Music size={14} /> 单曲
        </button>
        <button
          className={searchType === "albums" ? "active" : ""}
          type="button"
          onClick={() => {
            setSearchType("albums");
            setMode("search");
            runSearch(query, "albums").catch(() => setMessage("专辑搜索失败。"));
          }}
        >
          <Album size={14} /> 专辑
        </button>
      </div>

      <div className="netease-tabs">
        <button className={mode === "search" ? "active" : ""} type="button" onClick={() => setMode("search")}>
          <Search size={14} /> 搜索
        </button>
        <button
          className={mode === "web" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("web");
            if (account.siteAuthenticated && !webPlaylist) {
              loadWebPlaylist({ announce: true }).catch(() => undefined);
            }
          }}
        >
          <ListPlus size={14} /> 网页歌单
        </button>
        <button
          className={mode === "netease" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("netease");
            if (account.neteaseAuthenticated && playlists.length === 0) {
              loadPlaylists().catch(() => undefined);
            }
          }}
        >
          <Heart size={14} /> 网易云
        </button>
      </div>

      {mode === "web" ? (
        <div className="netease-playlists">
          {account.siteAuthenticated ? (
            <div className="netease-playlist active" aria-live="polite">
              <ListMusic size={15} />
              <span>{webPlaylist?.name ?? "网页歌单"}</span>
              <small>{webPlaylist?.trackCount ?? webPlaylistSongs.length}</small>
            </div>
          ) : (
            <div className="netease-empty">登录本站后可保存网页歌单。</div>
          )}
        </div>
      ) : null}

      {mode === "netease" ? (
        <div className="netease-playlists">
          {account.neteaseAuthenticated ? playlists.map((playlist) => (
            <button
              className={`netease-playlist ${selectedPlaylist?.id === playlist.id ? "active" : ""}`}
              key={playlist.id}
              type="button"
              onClick={() => loadPlaylistTracks(playlist)}
              disabled={isPlaylistTracksLoading && selectedPlaylist?.id === playlist.id}
            >
              {isPlaylistTracksLoading && selectedPlaylist?.id === playlist.id ? <LoaderCircle className="netease-spin" size={15} /> : <ListMusic size={15} />}
              <span>{playlist.name}</span>
              <small>{playlist.trackCount}</small>
            </button>
          )) : (
            <div className="netease-empty">连接网易云后可查看收藏歌单。</div>
          )}
          {account.neteaseAuthenticated && playlists.length === 0 && !isNeteasePlaylistsLoading ? (
            <div className="netease-empty">没有读取到网易云歌单。</div>
          ) : null}
        </div>
      ) : null}

      {mode === "search" && searchType === "albums" ? (
        <>
          <div className="netease-albums" aria-label="专辑搜索结果">
            {albumResults.map((album) => (
              <button
                className={`netease-album ${selectedAlbum?.id === album.id ? "active" : ""}`}
                key={album.id}
                type="button"
                onClick={() => loadAlbumTracks(album)}
                disabled={isAlbumLoading && selectedAlbum?.id === album.id}
              >
                <Image src={album.coverUrl || "https://placeholder.co/96x96"} alt={album.name} width={46} height={46} />
                <span>
                  <strong>{album.name}</strong>
                  <small>{album.artists} · {album.trackCount} 首</small>
                </span>
              </button>
            ))}
            {albumResults.length === 0 && !isLoading ? <div className="netease-empty">没有找到可展示的专辑。</div> : null}
          </div>

          {selectedAlbum ? (
            <div className="netease-album-current">
              <div>
                <strong>{selectedAlbum.name}</strong>
                <span>{selectedAlbum.artists} · {albumTracks.length || selectedAlbum.trackCount} 首</span>
              </div>
              <div className="netease-album-actions">
                <button
                  className="netease-connect-btn"
                  type="button"
                  onClick={() => albumTracks[0] ? playSong(albumTracks[0], albumTracks).catch(() => setMessage("专辑播放失败。")) : undefined}
                  disabled={albumTracks.length === 0}
                >
                  <Play size={14} fill="currentColor" /> 播放
                </button>
                <button
                  className="netease-connect-btn"
                  type="button"
                  onClick={() => addSongsToWebPlaylist(albumTracks, selectedAlbum.name)}
                  disabled={albumTracks.length === 0}
                >
                  <ListPlus size={14} /> 加入
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="netease-list" aria-label="歌曲列表">
        {visibleSongs.map((song) => (
          <div
            className={`netease-track ${currentSong?.id === song.id ? "active" : ""} ${draggingSongId === song.id ? "dragging" : ""}`}
            key={song.id}
            draggable={mode === "web"}
            onDragStart={(event) => {
              if (mode !== "web") return;
              setDraggingSongId(song.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", song.id);
            }}
            onDragOver={(event) => {
              if (mode === "web" && draggingSongId) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              if (mode !== "web") return;
              event.preventDefault();
              const fromId = event.dataTransfer.getData("text/plain") || draggingSongId;
              if (fromId) {
                reorderWebPlaylist(fromId, song.id).catch(() => undefined);
              }
            }}
            onDragEnd={() => setDraggingSongId(null)}
          >
            {mode === "web" ? <GripVertical className="netease-drag-handle" size={15} aria-hidden="true" /> : null}
            <button
              className="netease-track-main"
              type="button"
              onClick={() => playSong(song, visibleSongs)}
            >
              <span className="netease-track-name">{song.name}</span>
              <span className="netease-track-artist">{song.artists}</span>
              <span className="netease-track-time">{formatDuration(song.duration)}</span>
            </button>
            <div className="netease-track-actions">
              {mode === "web" ? (
                <button
                  className="netease-track-action"
                  type="button"
                  onClick={() => removeSongFromWebPlaylist(song)}
                  disabled={pendingIds.has(song.id)}
                  aria-label={`从网页歌单移除 ${song.name}`}
                  title="从网页歌单移除"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <button
                  className="netease-track-action"
                  type="button"
                  onClick={() => addSongToWebPlaylist(song)}
                  disabled={pendingIds.has(song.id) || webSongIds.has(song.id)}
                  aria-label={`加入网页歌单 ${song.name}`}
                  title={webSongIds.has(song.id) ? "已在网页歌单" : "加入网页歌单"}
                >
                  <ListPlus size={14} />
                </button>
              )}
              <button
                className="netease-track-action"
                type="button"
                onClick={() => likeSongOnNetease(song)}
                disabled={pendingIds.has(song.id) || !account.neteaseAuthenticated || neteaseLikedIds.has(song.id)}
                aria-label={`收藏到网易云 ${song.name}`}
                title={!account.neteaseAuthenticated ? "连接网易云后可收藏" : neteaseLikedIds.has(song.id) ? "已收藏到网易云" : "收藏到网易云"}
              >
                <HeartPlus size={14} />
              </button>
            </div>
          </div>
        ))}
        {visibleSongs.length === 0 ? (
          <div className="netease-empty">
            {mode === "web" && isWebPlaylistLoading
              ? "正在读取网页歌单。"
              : mode === "netease" && isPlaylistTracksLoading
                ? "正在读取网易云歌单歌曲。"
                : mode === "search" && searchType === "albums" && isAlbumLoading
                  ? "正在读取专辑曲目。"
                  : mode === "search" && searchType === "albums" && albumResults.length > 0 && !selectedAlbum
                    ? "选择一张专辑查看曲目。"
                    : message}
          </div>
        ) : null}
      </div>

      <div className="netease-status">{message}</div>
    </DashboardCard>
  );
}
