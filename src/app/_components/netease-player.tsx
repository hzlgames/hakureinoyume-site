"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useSyncExternalStore } from "react";
import {
  Album,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  X,
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

import { useMusicAccount } from "./music/use-account";
import { useMusicLibrary } from "./music/use-library";
import { usePlayback } from "./music/use-playback";
import { Artwork } from "./music/artwork";
import type { MusicSong } from "../../lib/music-types";

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

function subscribeDisplay(callback: () => void) {
  window.addEventListener("music-display-change", callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener("music-display-change", callback); window.removeEventListener("storage", callback); };
}
function readDisplay() {
  try { return localStorage.getItem("hakurei-music-display") === "compact"; } catch { return false; }
}

export function NeteasePlayer() {
  const compact = useSyncExternalStore(subscribeDisplay, readDisplay, () => false);
  function setDisplay(next: boolean) {
    try { localStorage.setItem("hakurei-music-display", next ? "compact" : "detailed"); } catch {}
    window.dispatchEvent(new Event("music-display-change"));
  }
  const auth = useMusicAccount();
  const { account, qr, isRefreshing, isConnecting, isDisconnecting } = auth;
  const library = useMusicLibrary(account, auth.handleExpiry);
  const { query, setQuery, mode, setMode, searchType, setSearchType, albumResults, selectedAlbum, albumTracks,
    playlists, selectedPlaylist, webPlaylist, webPlaylistSongs, webSongIds, neteaseLikedIds, pendingIds,
    isLoading, isNeteasePlaylistsLoading, isPlaylistTracksLoading, isWebPlaylistLoading, isAlbumLoading, isSaving,
    draggingSongId, setDraggingSongId, message, runSearch, loadPlaylistsForAccount, loadWebPlaylist, loadPlaylistTracks,
    loadAlbumTracks, addSongToWebPlaylist, removeSongFromWebPlaylist, addSongsToWebPlaylist, reorderWebPlaylist, likeSongOnNetease } = library;
  const playback = usePlayback(account.siteUserId, auth.handleExpiry);
  const { player, song: currentSong, progress, duration, volume, muted: isMuted, wantsPlayback: isPlaying } = playback;
  const visibleSongs = mode === 'queue' ? playback.queue : library.visibleSongs;
  const playerBusy = library.playerBusy || playback.status === 'loading' || playback.status === 'buffering';
  const startQrLogin = auth.startQr;
  const disconnect = auth.disconnect;
  const refreshAll = async () => {
    const next = await auth.refresh();
    if (!next) return;
    await Promise.allSettled([
      next.siteAuthenticated ? loadWebPlaylist({ announce: true }) : Promise.resolve(),
      loadPlaylistsForAccount(next)
    ]);
  };
  const playSong = (song: MusicSong, queue = visibleSongs) => player.play(song, queue);
  const playByOffset = player.skip;
  const togglePlayback = () => {
    if (!currentSong && visibleSongs[0]) void playSong(visibleSongs[0]);
    else player.toggle();
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runSearch(query, searchType); };
  const progressPercent = duration > 0 ? Math.min(progress / duration * 100, 100) : 0;
  const canSeek = duration > 0 && Number.isFinite(duration);
  const playbackLabel = playback.status === 'loading' ? '正在获取音源' : playback.status === 'buffering' ? '正在缓冲'
    : playback.status === 'playing' ? '正在播放' : playback.status === 'paused' ? '已暂停' : playback.status === 'error' ? '播放遇到问题' : '从曲库选择一首歌';
  return (
    <DashboardCard className={`netease-player ${compact ? "is-compact" : ""}`}>
      <CardHeader
        action={
          <div className="player-display" aria-label="播放器显示模式">
            {playerBusy && <LoaderCircle className="netease-spin" size={14} aria-label="加载中" />}
            <button type="button" aria-pressed={compact} onClick={() => setDisplay(true)}>简易</button>
            <button type="button" aria-pressed={!compact} onClick={() => setDisplay(false)}>详细</button>
          </div>
        }
        icon={<Music className="card-title-icon" size={18} />}
        title="网易云音乐"
      />

      <div className="netease-account">
        <div className="netease-account-main">
          {account.neteaseAuthenticated && account.profile ? (
            <>
              <div className="netease-avatar">
                {account.profile.avatarUrl ? (
                  <Artwork src={account.profile.avatarUrl} alt={account.profile.nickname} size={34} />
                ) : (
                  <UserRound size={18} />
                )}
              </div>
              <div>
                <div className="netease-account-name">{account.profile.nickname}</div>
                <div className="netease-account-note">已连接网易云</div>
              </div>
            </>
          ) : (
            <>
              <div className="netease-avatar"><UserRound size={18} /></div>
              <div>
                <div className="netease-account-name">{isRefreshing ? "正在同步账号" : account.expired ? "连接已过期" : "游客模式"}</div>
                <div className="netease-account-note">可搜索和播放</div>
              </div>
            </>
          )}
        </div>
        <div className="netease-account-actions">
          <button
            className="netease-icon-btn"
            type="button"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
            aria-label="刷新网易云状态"
            title="刷新网易云状态"
          >
            <RefreshCw className={isRefreshing ? "netease-spin" : undefined} size={16} />
          </button>
          {account.neteaseAuthenticated ? (
            <button className="netease-icon-btn" type="button" onClick={disconnect} disabled={isDisconnecting} aria-label="断开网易云">
              <LogOut size={16} />
            </button>
          ) : account.siteAuthenticated ? (
            <button className="netease-connect-btn" type="button" onClick={startQrLogin} disabled={isConnecting}>
              <LogIn size={14} /> 连接
            </button>
          ) : (
            <Link className="netease-connect-btn" href="/login">
              <LogIn size={14} /> 登录本站
            </Link>
          )}
        </div>
      </div>

      {auth.message && <div className="netease-account-status" role="status">{auth.message}</div>}
      {qr || isConnecting ? (
        <div className="netease-qr-panel" aria-label="连接网易云账号">
          <button type="button" className="netease-icon-btn netease-qr-close" onClick={auth.closeQr} aria-label="关闭二维码"><X size={16} /></button>
          {qr ? <Image src={qr.qrimg} alt="网易云登录二维码" width={160} height={160} /> : <LoaderCircle size={32} className="netease-spin" />}
          <div className="netease-qr-message" role="status">{qr?.message ?? "正在生成二维码…"}</div>
          <button className="netease-connect-btn" type="button" onClick={startQrLogin} disabled={isConnecting}>
            <RefreshCw size={14} /> 刷新二维码
          </button>
          <small>过期后会自动更新，关闭后停止检查。</small>
        </div>
      ) : null}

      <div className="netease-now">
        <div className="netease-cover">
          <div className="netease-vinyl" />
          <Artwork src={currentSong?.coverUrl} alt={currentSong?.album || currentSong?.name || "专辑"} size={72} />
        </div>
        <div className="netease-current">
          <div className="netease-song-title">{currentSong?.name ?? "选择一首歌"}</div>
          <div className="netease-song-artist">{currentSong?.artists ?? "搜索或打开收藏歌单后播放"}</div>
          <div className="netease-playback-label" role="status">{playbackLabel}{playback.trial ? " · 试听片段" : ""}</div>
          <div className="netease-controls">
            <button className="music-btn" type="button" onClick={() => playByOffset(-1)} disabled={!currentSong} aria-label="上一首">
              <SkipBack size={16} />
            </button>
            <button className="music-btn play" type="button" onClick={togglePlayback} disabled={!currentSong && visibleSongs.length === 0} aria-label={isPlaying ? "暂停" : playback.status === "error" ? "重试播放" : "播放"}>
              {isPlaying ? <Pause size={20} /> : playback.status === "error" ? <RefreshCw size={20} /> : <Play size={20} fill="currentColor" />}
            </button>
            <button className="music-btn" type="button" onClick={() => playByOffset(1)} disabled={!currentSong} aria-label="下一首">
              <SkipForward size={16} />
            </button>
            <div className="music-volume">
              <button
                className="music-btn"
                type="button"
                onClick={player.toggleMute}
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
                  player.setVolume(nextVolume);
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
                onChange={(event) => player.seek(Number(event.currentTarget.value))}
                step={0.1}
                type="range"
                value={canSeek ? Math.min(progress, duration) : 0}
              />
            </div>
            <span>{formatClock(duration)}</span>
          </div>
        </div>
      </div>

      <div className="player-library" inert={compact} aria-hidden={compact}><div className="player-library-inner">
      <div className="netease-tabs">
        <button aria-pressed={mode === "search"} className={mode === "search" ? "active" : ""} type="button" onClick={() => setMode("search")}>
          <Search size={14} /> 搜索
        </button>
        <button
          aria-pressed={mode === "web"} className={mode === "web" ? "active" : ""}
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
          aria-pressed={mode === "netease"} className={mode === "netease" ? "active" : ""}
          type="button"
          onClick={() => {
            setMode("netease");
            if (account.neteaseAuthenticated) {
              loadPlaylistsForAccount(account).catch(() => undefined);
            }
          }}
        >
          <Heart size={14} /> 网易云
        </button>
        <button aria-pressed={mode === "queue"} className={mode === "queue" ? "active" : ""} type="button" onClick={() => setMode("queue")}><ListMusic size={14} /> 队列 {playback.queue.length || ""}</button>
      </div>


      {mode === "search" && <form className="netease-search" onSubmit={submitSearch}>
        <Search size={15} />
        <input
          aria-label="搜索歌曲或专辑"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchType === "albums" ? "搜索专辑、艺人" : "搜索歌曲、歌手"}
        />
        <button type="submit">搜索</button>
      </form>}

      {mode === "search" ? (
        <div className="netease-search-types" aria-label="搜索类型">
          <button
            className={searchType === "songs" ? "active" : ""}
            type="button"
            onClick={() => {
              setSearchType("songs");
              setMode("search");
              runSearch(query, "songs").catch(() => undefined);
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
              runSearch(query, "albums").catch(() => undefined);
            }}
          >
            <Album size={14} /> 专辑
          </button>
        </div>
      ) : null}

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
          {!selectedAlbum && <div className="netease-albums" aria-label="专辑搜索结果">
            {albumResults.map((album) => (
              <button
                className="netease-album"
                key={album.id}
                type="button"
                onClick={() => loadAlbumTracks(album)}
              >
                <div className="netease-album-artwork"><Artwork src={album.coverUrl} alt={album.name} size={46} /></div>
                <span>
                  <strong>{album.name}</strong>
                  <small>{album.artists} · {album.trackCount} 首</small>
                </span>
              </button>
            ))}
            {albumResults.length === 0 && !isLoading ? <div className="netease-empty">没有找到可展示的专辑。</div> : null}
          </div>}

          {selectedAlbum ? (
            <div className="netease-album-current">
              <button className="netease-icon-btn" type="button" onClick={library.closeAlbum} aria-label="返回专辑搜索"><ArrowLeft size={16} /></button>
              <div>
                <strong>{selectedAlbum.name}</strong>
                <span>{selectedAlbum.artists} · {albumTracks.length || selectedAlbum.trackCount} 首</span>
              </div>
              <div className="netease-album-actions">
                <button
                  className="netease-connect-btn"
                  type="button"
                  onClick={() => albumTracks[0] ? playSong(albumTracks[0], albumTracks).catch(() => undefined) : undefined}
                  disabled={albumTracks.length === 0}
                >
                  <Play size={14} fill="currentColor" /> 播放
                </button>
                <button
                  className="netease-connect-btn"
                  type="button"
                  onClick={() => addSongsToWebPlaylist(albumTracks, selectedAlbum.name)}
                  disabled={albumTracks.length === 0 || isSaving || !account.siteAuthenticated}
                >
                  <ListPlus size={14} /> 加入
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {visibleSongs.length > 0 && <div className="netease-list-heading">
        <span>{mode === 'queue' ? '当前播放队列' : mode === 'netease' ? selectedPlaylist?.name : mode === 'web' ? '网页歌单' : '曲目'} · {visibleSongs.length} 首</span>
        {mode !== 'queue' && <button type="button" className="netease-connect-btn" onClick={() => void playSong(visibleSongs[0], visibleSongs)}><Play size={12} /> 播放全部</button>}
      </div>}
      <div className="netease-list" aria-label="歌曲列表" aria-busy={isLoading || isPlaylistTracksLoading || isAlbumLoading || isWebPlaylistLoading}>
        {visibleSongs.map((song) => (
          <div
            className={`netease-track ${currentSong?.id === song.id ? "active" : ""} ${draggingSongId === song.id ? "dragging" : ""}`}
            key={song.id}
            draggable={mode === "web" && !isSaving}
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
              aria-label={`${currentSong?.id === song.id && isPlaying ? "暂停" : "播放"} ${song.name}`}
              onClick={() => currentSong?.id === song.id ? player.toggle() : void playSong(song, visibleSongs)}
            >
              <span className="netease-track-artwork"><Artwork src={song.coverUrl} alt={song.album || song.name} size={36} /></span>
              <span className="netease-track-name">{song.name}</span>
              <span className="netease-track-artist">{song.artists}</span>
              <span className="netease-track-time">{formatDuration(song.duration)}</span>
            </button>
            <div className="netease-track-actions">
              {mode === "web" && <>
                <button className="netease-track-action" type="button" aria-label={`上移 ${song.name}`} disabled={isSaving || visibleSongs[0]?.id === song.id} onClick={() => void reorderWebPlaylist(song.id, visibleSongs[visibleSongs.findIndex(item => item.id === song.id) - 1].id)}><ArrowUp size={13} /></button>
                <button className="netease-track-action" type="button" aria-label={`下移 ${song.name}`} disabled={isSaving || visibleSongs.at(-1)?.id === song.id} onClick={() => void reorderWebPlaylist(song.id, visibleSongs[visibleSongs.findIndex(item => item.id === song.id) + 1].id)}><ArrowDown size={13} /></button>
              </>}
              {mode === "web" ? (
                <button
                  className="netease-track-action"
                  type="button"
                  onClick={() => removeSongFromWebPlaylist(song)}
                  disabled={isSaving || pendingIds.has(song.id)}
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
                  disabled={isSaving || !account.siteAuthenticated || pendingIds.has(song.id) || webSongIds.has(song.id)}
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
                disabled={isSaving || pendingIds.has(song.id) || !account.neteaseAuthenticated || neteaseLikedIds.has(song.id)}
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
                    : mode === "queue" ? "播放歌曲后，会在这里显示队列。"
                    : mode === "web" ? (account.siteAuthenticated ? "网页歌单为空，可从搜索结果添加歌曲。" : "登录本站后可保存网页歌单。")
                    : mode === "netease" ? (account.neteaseAuthenticated ? "选择一个歌单查看歌曲。" : "连接网易云后可查看歌单。")
                    : isLoading ? "正在搜索…" : "暂无搜索结果。"}
          </div>
        ) : null}
      </div>

      </div></div>
      <div className={`netease-status ${playback.error ? "is-error" : ""}`} role="status">{playback.error || message || (compact ? "切换详细模式可搜索歌曲、浏览歌单与队列。" : "浏览曲库不会改变当前播放队列。")}</div>
    </DashboardCard>
  );
}
