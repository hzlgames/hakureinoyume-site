"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountState, MusicSong, MusicAlbum, MusicPlaylist, WebPlaylistState } from "../../../lib/music-types";
import { errorMessage, fetchJson } from "./api";

export function useMusicLibrary(account: AccountState, handleNeteaseExpiry: (error: unknown) => boolean) {
  const searchRequest = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const accountEpoch = useRef(0);
  const mutationLock = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const neteasePlaylistsRequestIdRef = useRef(0);
  const playlistTracksRequestIdRef = useRef(0);
  const webPlaylistRequestIdRef = useRef(0);
  const albumRequestIdRef = useRef(0);
  const [query, setQuery] = useState("东方Project");
  const [mode, setMode] = useState<"search" | "web" | "netease" | "queue">("search");
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
  const [isLoading, setIsLoading] = useState(false);
  const [isNeteasePlaylistsLoading, setIsNeteasePlaylistsLoading] = useState(false);
  const [isPlaylistTracksLoading, setIsPlaylistTracksLoading] = useState(false);
  const [isWebPlaylistLoading, setIsWebPlaylistLoading] = useState(false);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [pendingSongIds, setPendingSongIds] = useState<string[]>([]);
  const [neteaseLikedSongIds, setNeteaseLikedSongIds] = useState<string[]>([]);
  const [draggingSongId, setDraggingSongId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleSongs = useMemo(
    () => {
      if (mode === "web") return account.siteAuthenticated ? webPlaylistSongs : [];
      if (mode === "netease") return account.neteaseAuthenticated ? playlistTracks : [];
      if (searchType === "albums") return albumTracks;
      return searchResults;
    },
    [account.siteAuthenticated, account.neteaseAuthenticated, albumTracks, mode, playlistTracks, searchResults, searchType, webPlaylistSongs]
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
      setIsNeteasePlaylistsLoading(false);
      return [];
    }

    setIsNeteasePlaylistsLoading(true);
    try {
      const data = await fetchJson<{ playlists: MusicPlaylist[] }>(`/api/music/playlists?t=${Date.now()}`);

      if (requestId !== neteasePlaylistsRequestIdRef.current) return [];

      setPlaylists(data.playlists);
      void fetchJson<{ ids: string[] }>("/api/music/likes").then(likes => {
        if (requestId === neteasePlaylistsRequestIdRef.current) setNeteaseLikedSongIds(likes.ids);
      }).catch(error => {
        if (requestId === neteasePlaylistsRequestIdRef.current) handleNeteaseExpiry(error);
      });

      if (options.announce) {
        setMessage(data.playlists.length > 0 ? "已读取网易云收藏歌单。" : "没有读取到收藏歌单。");
      }

      return data.playlists;
    } catch (error) {
      if (requestId === neteasePlaylistsRequestIdRef.current) {
        handleNeteaseExpiry(error);
      }
      throw error;
    } finally {
      if (requestId === neteasePlaylistsRequestIdRef.current) {
        setIsNeteasePlaylistsLoading(false);
      }
    }
  }, [handleNeteaseExpiry]);

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
        handleNeteaseExpiry(error);
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
  }, [handleNeteaseExpiry]);

  const runSearch = useCallback(async (nextQuery: string, nextType: "songs" | "albums" = "songs") => {
    const keyword = nextQuery.trim();
    if (!keyword) return;

    const requestId = ++searchRequest.current;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    albumRequestIdRef.current++;
    setSelectedAlbum(null); setAlbumTracks([]); setIsAlbumLoading(false);
    setSearchType(nextType); setMode("search");
    setSearchResults([]); setAlbumResults([]);
    setIsLoading(true);
    try {
      if (nextType === "albums") {
        const data = await fetchJson<{ albums: MusicAlbum[] }>(`/api/music/search?keywords=${encodeURIComponent(keyword)}&type=album&limit=16&t=${Date.now()}`, { signal: controller.signal });
        if (requestId !== searchRequest.current) return;
        setAlbumResults(data.albums);
        setSelectedAlbum(null);
        setAlbumTracks([]);
        setMessage(data.albums.length > 0 ? "专辑搜索结果已更新。" : "没有找到可展示的专辑。");
        return;
      }

      const data = await fetchJson<{ songs: MusicSong[] }>(`/api/music/search?keywords=${encodeURIComponent(keyword)}&type=song&limit=24&t=${Date.now()}`, { signal: controller.signal });
      if (requestId !== searchRequest.current) return;
      setSearchResults(data.songs);
      setMessage(data.songs.length > 0 ? "搜索结果已更新。" : "没有找到可展示的歌曲。");
    } catch (error) {
      if (requestId !== searchRequest.current || controller.signal.aborted) return;
      if (!handleNeteaseExpiry(error)) setMessage(errorMessage(error, "搜索失败。"));
    } finally {
      if (requestId === searchRequest.current) setIsLoading(false);
    }
  }, [handleNeteaseExpiry]);


  const stopSearch = useCallback(() => { searchRequest.current++; searchAbort.current?.abort(); albumRequestIdRef.current++; }, []);
  useEffect(() => {
    // Start the initial remote query and cancel its result when the component unmounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runSearch("东方Project", "songs");
    return stopSearch;
  }, [runSearch, stopSearch]);
  const siteId = account.siteAuthenticated ? account.siteUserId ?? "site" : null;
  const neteaseId = account.neteaseAuthenticated ? account.profile?.userId ?? "connected" : null;
  const stopPrivateRequests = useCallback(() => {
    accountEpoch.current++; webPlaylistRequestIdRef.current++; neteasePlaylistsRequestIdRef.current++; playlistTracksRequestIdRef.current++;
  }, []);
  useEffect(() => {
    accountEpoch.current++;
    // Invalidate private library state when the external account identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    mutationLock.current = false; setIsSaving(false); setPendingSongIds([]);
    setWebPlaylist(null); setWebPlaylistSongs([]);
    setPlaylists([]); setSelectedPlaylist(null); setPlaylistTracks([]); setNeteaseLikedSongIds([]);
    setIsPlaylistTracksLoading(false); setIsNeteasePlaylistsLoading(false); setIsWebPlaylistLoading(false);
    if (siteId) void loadWebPlaylist().catch(() => undefined);
    if (neteaseId) void loadPlaylistsForAccount({ siteAuthenticated: true, neteaseAuthenticated: true, profile: null }).catch(error => setMessage(errorMessage(error)));
    return stopPrivateRequests;
  }, [siteId, neteaseId, loadWebPlaylist, loadPlaylistsForAccount, stopPrivateRequests]);
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
      setMessage(`已载入 ${playlist.name}。`);
    } catch (error) {
      if (requestId === playlistTracksRequestIdRef.current && !handleNeteaseExpiry(error)) {
        setMessage(error instanceof Error ? error.message : "歌单歌曲读取失败。");
      }
    } finally {
      if (requestId === playlistTracksRequestIdRef.current) {
        setIsPlaylistTracksLoading(false);
      }
    }
  };

  const loadAlbumTracks = async (album: MusicAlbum) => {
    searchRequest.current++; searchAbort.current?.abort(); setIsLoading(false);
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
      setMessage(data.songs.length > 0 ? `已载入专辑：${album.name}` : "这张专辑没有可展示的曲目。");
    } catch (error) {
      if (requestId === albumRequestIdRef.current && !handleNeteaseExpiry(error)) {
        setMessage(error instanceof Error ? error.message : "专辑曲目读取失败。");
      }
    } finally {
      if (requestId === albumRequestIdRef.current) {
        setIsAlbumLoading(false);
      }
    }
  };

  const addSongToWebPlaylist = async (song: MusicSong) => {
    const epoch = accountEpoch.current;
    if (mutationLock.current) return;
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号，再添加到网页歌单。");
      return;
    }

    mutationLock.current = true; setIsSaving(true); webPlaylistRequestIdRef.current++; setIsWebPlaylistLoading(false);
    markSongPending(song.id, true);
    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/tracks", {
        method: "POST",
        body: JSON.stringify({ song })
      });
      if (epoch !== accountEpoch.current) return;
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已加入网页歌单：${song.name}`);
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      handleNeteaseExpiry(error);
      setMessage(error instanceof Error ? error.message : "加入网页歌单失败。");
    } finally {
      if (epoch === accountEpoch.current) { mutationLock.current = false; setIsSaving(false); }
      if (epoch === accountEpoch.current) markSongPending(song.id, false);
    }
  };

  const removeSongFromWebPlaylist = async (song: MusicSong) => {
    const epoch = accountEpoch.current;
    if (mutationLock.current) return;
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号。");
      return;
    }

    mutationLock.current = true; setIsSaving(true); webPlaylistRequestIdRef.current++; setIsWebPlaylistLoading(false);
    markSongPending(song.id, true);
    try {
      const data = await fetchJson<WebPlaylistState>(`/api/music/web-playlist/tracks?id=${encodeURIComponent(song.id)}`, {
        method: "DELETE"
      });
      if (epoch !== accountEpoch.current) return;
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已从网页歌单移除：${song.name}`);
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      handleNeteaseExpiry(error);
      setMessage(error instanceof Error ? error.message : "移除网页歌单歌曲失败。");
    } finally {
      if (epoch === accountEpoch.current) { mutationLock.current = false; setIsSaving(false); }
      if (epoch === accountEpoch.current) markSongPending(song.id, false);
    }
  };

  const addSongsToWebPlaylist = async (songs: MusicSong[], label: string) => {
    const epoch = accountEpoch.current;
    if (mutationLock.current) return;
    if (!account.siteAuthenticated) {
      setMessage("请先登录本站账号，再添加到网页歌单。");
      return;
    }

    const songsToAdd = songs.filter((song) => !webSongIds.has(song.id));
    if (songsToAdd.length === 0) {
      setMessage("这些歌曲已经在网页歌单中。");
      return;
    }

    mutationLock.current = true; setIsSaving(true); webPlaylistRequestIdRef.current++; setIsWebPlaylistLoading(false);
    setPendingSongIds((current) => Array.from(new Set([...current, ...songsToAdd.map((song) => song.id)])));
    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/tracks", {
        method: "POST",
        body: JSON.stringify({ songs: songsToAdd })
      });
      if (epoch !== accountEpoch.current) return;
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage(`已加入网页歌单：${label}`);
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      handleNeteaseExpiry(error);
      setMessage(error instanceof Error ? error.message : "批量加入网页歌单失败。");
    } finally {
      if (epoch === accountEpoch.current) { mutationLock.current = false; setIsSaving(false); }
      if (epoch === accountEpoch.current) setPendingSongIds((current) => current.filter((id) => !songsToAdd.some((song) => song.id === id)));
    }
  };

  const reorderWebPlaylist = async (fromId: string, toId: string) => {
    const epoch = accountEpoch.current;
    if (mutationLock.current) return;
    if (!account.siteAuthenticated || fromId === toId) return;

    const fromIndex = webPlaylistSongs.findIndex((song) => song.id === fromId);
    const toIndex = webPlaylistSongs.findIndex((song) => song.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextSongs = [...webPlaylistSongs];
    const [moved] = nextSongs.splice(fromIndex, 1);
    nextSongs.splice(toIndex, 0, moved);
    mutationLock.current = true; setIsSaving(true); webPlaylistRequestIdRef.current++; setIsWebPlaylistLoading(false);
    setWebPlaylistSongs(nextSongs);
    setDraggingSongId(null);

    try {
      const data = await fetchJson<WebPlaylistState>("/api/music/web-playlist/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: nextSongs.map((song) => song.id) })
      });
      if (epoch !== accountEpoch.current) return;
      setWebPlaylist(data.playlist);
      setWebPlaylistSongs(data.songs);
      setMessage("网页歌单顺序已更新。");
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      handleNeteaseExpiry(error);
      setMessage(error instanceof Error ? error.message : "网页歌单排序保存失败。");
      loadWebPlaylist().catch(() => undefined);
    } finally {
      if (epoch === accountEpoch.current) { mutationLock.current = false; setIsSaving(false); }
    }
  };

  const likeSongOnNetease = async (song: MusicSong) => {
    const epoch = accountEpoch.current;
    if (mutationLock.current) return;
    if (!account.neteaseAuthenticated) {
      setMessage("请先连接网易云账户，再收藏到网易云。");
      return;
    }

    mutationLock.current = true; setIsSaving(true); webPlaylistRequestIdRef.current++; setIsWebPlaylistLoading(false);
    markSongPending(song.id, true);
    try {
      await fetchJson<{ ok: boolean }>("/api/music/like", {
        method: "POST",
        body: JSON.stringify({ id: song.id, like: true })
      });
      if (epoch !== accountEpoch.current) return;
      setNeteaseLikedSongIds((current) => current.includes(song.id) ? current : [...current, song.id]);
      setMessage(`已收藏到网易云：${song.name}`);
    } catch (error) {
      if (epoch !== accountEpoch.current) return;
      handleNeteaseExpiry(error);
      if (!handleNeteaseExpiry(error)) {
        setMessage(error instanceof Error ? error.message : "网易云收藏失败。");
      }
    } finally {
      if (epoch === accountEpoch.current) { mutationLock.current = false; setIsSaving(false); }
      if (epoch === accountEpoch.current) markSongPending(song.id, false);
    }
  };


  const closeAlbum = () => { albumRequestIdRef.current++; setSelectedAlbum(null); setAlbumTracks([]); setIsAlbumLoading(false); };
  return { closeAlbum, query, setQuery, mode, setMode, searchType, setSearchType, searchResults, albumResults, selectedAlbum, albumTracks,
    playlists, selectedPlaylist, playlistTracks, webPlaylist, webPlaylistSongs, visibleSongs, webSongIds, neteaseLikedIds, pendingIds,
    isLoading, isNeteasePlaylistsLoading, isPlaylistTracksLoading, isWebPlaylistLoading, isAlbumLoading, isSaving, playerBusy,
    draggingSongId, setDraggingSongId, message, setMessage, runSearch, loadPlaylistsForAccount, loadWebPlaylist, loadPlaylistTracks,
    loadAlbumTracks, addSongToWebPlaylist, removeSongFromWebPlaylist, addSongsToWebPlaylist, reorderWebPlaylist, likeSongOnNetease };
}
