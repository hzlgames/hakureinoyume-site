import { NextResponse } from "next/server";
import type { Prisma } from "../../../../generated/prisma/client";
import { getCurrentSession } from "../../../../lib/admin";
import prisma from "../../../../lib/prisma";
import {
  deleteStoredNeteaseAccount,
  extractProfile,
  getAnonymousNeteaseCookie,
  getStoredNeteaseAccount,
  isLoginExpiredPayload,
  markStoredNeteaseAccountExpired,
  NeteaseServiceError,
  requestNetease,
  saveStoredNeteaseAccount
} from "../../../../lib/netease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MusicRouteContext = {
  params: Promise<{
    music: string[];
  }>;
};

type SongRecord = Record<string, unknown>;
type AlbumRecord = Record<string, unknown>;
type SessionUser = {
  id: string;
};

function json(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readId(value: unknown) {
  const numberValue = readNumber(value);
  if (numberValue !== null) return String(numberValue);
  const stringValue = readString(value).trim();
  return stringValue || null;
}

function getArtists(song: SongRecord) {
  const artists = Array.isArray(song.ar) ? song.ar : Array.isArray(song.artists) ? song.artists : [];

  return artists
    .map((artist) => readString(asRecord(artist)?.name).trim())
    .filter(Boolean)
    .join(" / ");
}

function normalizeSong(song: SongRecord) {
  const album = asRecord(song.al) ?? asRecord(song.album);

  return {
    id: readId(song.id) ?? "",
    name: readString(song.name).trim() || "未知歌曲",
    artists: getArtists(song) || "未知艺人",
    album: readString(album?.name).trim() || "",
    coverUrl: readString(album?.picUrl).trim() || readString(album?.coverImgUrl).trim() || null,
    duration: readNumber(song.dt ?? song.duration) ?? null,
    fee: readNumber(song.fee),
    playable: true
  };
}

function normalizePlaylist(playlist: Record<string, unknown>) {
  return {
    id: readId(playlist.id) ?? "",
    name: readString(playlist.name).trim() || "未命名歌单",
    coverUrl: readString(playlist.coverImgUrl).trim() || null,
    trackCount: readNumber(playlist.trackCount) ?? 0,
    playCount: readNumber(playlist.playCount) ?? 0
  };
}

function getAlbumArtists(album: AlbumRecord) {
  const artists = Array.isArray(album.artists)
    ? album.artists
    : asRecord(album.artist)
      ? [asRecord(album.artist)]
      : [];

  return artists
    .map((artist) => readString(asRecord(artist)?.name).trim())
    .filter(Boolean)
    .join(" / ");
}

function normalizeAlbum(album: AlbumRecord) {
  return {
    id: readId(album.id) ?? "",
    name: readString(album.name).trim() || "未知专辑",
    artists: getAlbumArtists(album) || "未知艺人",
    coverUrl: readString(album.picUrl).trim() || readString(album.blurPicUrl).trim() || null,
    trackCount: readNumber(album.size ?? album.trackCount) ?? 0,
    publishTime: readNumber(album.publishTime),
    company: readString(album.company).trim() || null
  };
}

function getCode(payload: unknown) {
  return readNumber(asRecord(payload)?.code);
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return {};
  }

  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function getNeteaseCookie(userId?: string | null) {
  if (userId) {
    const account = await getStoredNeteaseAccount(userId);
    if (account) {
      return {
        cookie: account.cookie,
        source: "account" as const,
        account
      };
    }
  }

  return {
    cookie: await getAnonymousNeteaseCookie(),
    source: "anonymous" as const,
    account: null
  };
}

async function callWithUserCookie(
  path: string,
  userId: string | null | undefined,
  params: Record<string, string | number | boolean | null | undefined> = {},
  options: { method?: "GET" | "POST" } = {}
) {
  const access = await getNeteaseCookie(userId);
  const response = await requestNetease(path, params, {
    cookie: access.cookie,
    method: options.method
  });

  if (isLoginExpiredPayload(response.payload) && access.source === "account" && userId) {
    await markStoredNeteaseAccountExpired(userId);

    return {
      expired: true as const,
      payload: response.payload
    };
  }

  return {
    expired: false as const,
    payload: response.payload
  };
}

function loginRequired() {
  return json({
    error: "netease_login_required",
    message: "网易云登录态已失效，请重新登录。"
  }, { status: 401 });
}

function siteLoginRequired() {
  return json({
    error: "site_login_required",
    message: "请先登录本站账号。"
  }, { status: 401 });
}

async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getCurrentSession();
  return session?.user?.id ? { id: session.user.id } : null;
}

async function getDefaultWebPlaylist(userId: string) {
  return await prisma.webMusicPlaylist.upsert({
    where: {
      userId_name: {
        userId,
        name: "网页歌单"
      }
    },
    create: {
      userId,
      name: "网页歌单"
    },
    update: {}
  });
}

function normalizeWebPlaylistSong(song: {
  id: string;
  songId: string;
  name: string;
  artists: string;
  album: string | null;
  coverUrl: string | null;
  duration: number | null;
  position: number;
  addedAt: Date;
}) {
  return {
    rowId: song.id,
    id: song.songId,
    name: song.name,
    artists: song.artists,
    album: song.album ?? "",
    coverUrl: song.coverUrl,
    duration: song.duration,
    position: song.position,
    addedAt: song.addedAt.toISOString()
  };
}

async function readWebPlaylist(userId: string) {
  const playlist = await getDefaultWebPlaylist(userId);
  const songs = await prisma.webMusicPlaylistSong.findMany({
    where: { playlistId: playlist.id },
    orderBy: [
      { position: "asc" },
      { addedAt: "asc" }
    ]
  });

  return {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      trackCount: songs.length
    },
    songs: songs.map(normalizeWebPlaylistSong)
  };
}

async function getNextWebPlaylistPosition(playlistId: string) {
  const latest = await prisma.webMusicPlaylistSong.findFirst({
    where: { playlistId },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  return latest ? latest.position + 1 : 0;
}

async function handleMe() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return json({
      siteAuthenticated: false,
      neteaseAuthenticated: false,
      profile: null
    });
  }

  const account = await getStoredNeteaseAccount(session.user.id);

  if (!account) {
    return json({
      siteAuthenticated: true,
      neteaseAuthenticated: false,
      profile: null
    });
  }

  const status = await requestNetease("/login/status", {}, { cookie: account.cookie });

  if (isLoginExpiredPayload(status.payload)) {
    await markStoredNeteaseAccountExpired(session.user.id);
    return json({
      siteAuthenticated: true,
      neteaseAuthenticated: false,
      profile: account.profile,
      expired: true
    });
  }

  const profile = extractProfile(status.payload) ?? account.profile;
  return json({
    siteAuthenticated: true,
    neteaseAuthenticated: true,
    profile
  });
}

async function handleQrStart() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return json({ error: "site_login_required", message: "请先登录本站账号。" }, { status: 401 });
  }

  const keyResponse = await requestNetease("/login/qr/key");
  const keyData = asRecord(asRecord(keyResponse.payload)?.data);
  const key = readString(keyData?.unikey).trim();

  if (!key) {
    throw new NeteaseServiceError("Failed to create NetEase QR login key.");
  }

  const qrResponse = await requestNetease("/login/qr/create", {
    key,
    qrimg: true
  });
  const qrData = asRecord(asRecord(qrResponse.payload)?.data);

  return json({
    key,
    qrimg: readString(qrData?.qrimg),
    qrurl: readString(qrData?.qrurl)
  });
}

async function handleQrCheck(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return json({ error: "site_login_required", message: "请先登录本站账号。" }, { status: 401 });
  }

  const body = await readBody(request);
  const key = readString(body.key).trim();

  if (!key) {
    return json({ error: "missing_key" }, { status: 400 });
  }

  const checkResponse = await requestNetease("/login/qr/check", { key, noCookie: true });
  const code = getCode(checkResponse.payload);

  if (code !== 803) {
    return json({
      code,
      message: readString(asRecord(checkResponse.payload)?.message || asRecord(checkResponse.payload)?.msg)
    });
  }

  const cookie = checkResponse.cookie;
  if (!cookie) {
    throw new NeteaseServiceError("NetEase login succeeded but did not return cookie.");
  }

  const accountResponse = await requestNetease("/user/account", {}, { cookie });
  const profile = extractProfile(accountResponse.payload);

  await saveStoredNeteaseAccount({
    userId: session.user.id,
    cookie,
    profile,
    rawProfile: toJsonValue(accountResponse.payload)
  });

  return json({
    code,
    profile
  });
}

async function handleLogout() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return json({ ok: true });
  }

  await deleteStoredNeteaseAccount(session.user.id);
  return json({ ok: true });
}

async function handleSearch(request: Request) {
  const session = await getCurrentSession();
  const { searchParams } = new URL(request.url);
  const keywords = (searchParams.get("keywords") ?? "").trim();
  const type = searchParams.get("type") === "album" ? "album" : "song";

  if (!keywords) {
    return json(type === "album" ? { albums: [] } : { songs: [] });
  }

  const result = await callWithUserCookie("/cloudsearch", session?.user.id, {
    keywords,
    limit: Math.min(Number(searchParams.get("limit") ?? 20), 50),
    offset: Math.max(Number(searchParams.get("offset") ?? 0), 0),
    type: type === "album" ? 10 : 1
  }, {
    method: type === "album" ? "GET" : "POST"
  });

  if (result.expired) return loginRequired();

  if (type === "album") {
    const albums = Array.isArray(asRecord(asRecord(result.payload)?.result)?.albums)
      ? asRecord(asRecord(result.payload)?.result)?.albums as AlbumRecord[]
      : [];

    return json({
      albums: albums.map(normalizeAlbum)
    });
  }

  const songs = Array.isArray(asRecord(asRecord(result.payload)?.result)?.songs)
    ? asRecord(asRecord(result.payload)?.result)?.songs as SongRecord[]
    : [];

  return json({
    songs: songs.map(normalizeSong)
  });
}

async function handleAlbumTracks(request: Request) {
  const session = await getCurrentSession();
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return json({ error: "missing_album_id" }, { status: 400 });
  }

  const result = await callWithUserCookie("/album", session?.user.id, { id }, { method: "GET" });
  if (result.expired) return loginRequired();

  const album = asRecord(asRecord(result.payload)?.album);
  const songs = Array.isArray(asRecord(result.payload)?.songs)
    ? asRecord(result.payload)?.songs as SongRecord[]
    : [];

  return json({
    album: album ? normalizeAlbum(album) : null,
    songs: songs.map(normalizeSong)
  });
}

async function handlePlaylists() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return loginRequired();
  }

  const account = await getStoredNeteaseAccount(session.user.id);
  if (!account?.profile?.userId) {
    return loginRequired();
  }

  const result = await callWithUserCookie("/user/playlist", session.user.id, {
    uid: account.profile.userId,
    limit: 100
  });

  if (result.expired) return loginRequired();

  const playlists = Array.isArray(asRecord(result.payload)?.playlist)
    ? asRecord(result.payload)?.playlist as Record<string, unknown>[]
    : [];

  return json({
    playlists: playlists.map(normalizePlaylist)
  });
}

async function handleWebPlaylist() {
  const user = await getSessionUser();
  if (!user) return siteLoginRequired();

  return json(await readWebPlaylist(user.id));
}

async function handleAddWebPlaylistTrack(request: Request) {
  const user = await getSessionUser();
  if (!user) return siteLoginRequired();

  const body = await readBody(request);
  const songsInput = Array.isArray(body.songs)
    ? body.songs
    : [asRecord(body.song) ?? body];
  const songs = songsInput
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  if (songs.length === 0) {
    return json({ error: "invalid_song", message: "歌曲信息不完整。" }, { status: 400 });
  }

  const playlist = await getDefaultWebPlaylist(user.id);
  let nextPosition = await getNextWebPlaylistPosition(playlist.id);

  await prisma.$transaction(async (tx) => {
    for (const song of songs) {
      const id = readId(song.id ?? song.songId);
      const name = readString(song.name).trim();

      if (!id || !name) continue;

      const existing = await tx.webMusicPlaylistSong.findUnique({
        where: {
          playlistId_songId: {
            playlistId: playlist.id,
            songId: id
          }
        },
        select: { position: true }
      });

      await tx.webMusicPlaylistSong.upsert({
        where: {
          playlistId_songId: {
            playlistId: playlist.id,
            songId: id
          }
        },
        create: {
          playlistId: playlist.id,
          songId: id,
          name,
          artists: readString(song.artists).trim() || "未知艺人",
          album: readString(song.album).trim() || null,
          coverUrl: readString(song.coverUrl).trim() || null,
          duration: readNumber(song.duration),
          position: nextPosition
        },
        update: {
          name,
          artists: readString(song.artists).trim() || "未知艺人",
          album: readString(song.album).trim() || null,
          coverUrl: readString(song.coverUrl).trim() || null,
          duration: readNumber(song.duration)
        }
      });

      if (!existing) {
        nextPosition += 1;
      }
    }
  });

  return json(await readWebPlaylist(user.id));
}

async function handleRemoveWebPlaylistTrack(request: Request) {
  const user = await getSessionUser();
  if (!user) return siteLoginRequired();

  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return json({ error: "missing_song_id" }, { status: 400 });
  }

  const playlist = await getDefaultWebPlaylist(user.id);
  await prisma.webMusicPlaylistSong.deleteMany({
    where: {
      playlistId: playlist.id,
      songId: id
    }
  });

  return json(await readWebPlaylist(user.id));
}

async function handleReorderWebPlaylistTracks(request: Request) {
  const user = await getSessionUser();
  if (!user) return siteLoginRequired();

  const body = await readBody(request);
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => readId(id)).filter((id): id is string => Boolean(id))
    : [];

  if (ids.length === 0) {
    return json({ error: "missing_song_ids" }, { status: 400 });
  }

  const playlist = await getDefaultWebPlaylist(user.id);
  const existing = await prisma.webMusicPlaylistSong.findMany({
    where: { playlistId: playlist.id },
    select: { songId: true }
  });
  const existingIds = new Set(existing.map((song) => song.songId));
  const orderedIds = [
    ...ids.filter((id) => existingIds.has(id)),
    ...existing.map((song) => song.songId).filter((id) => !ids.includes(id))
  ];

  await prisma.$transaction(
    orderedIds.map((songId, position) => prisma.webMusicPlaylistSong.update({
      where: {
        playlistId_songId: {
          playlistId: playlist.id,
          songId
        }
      },
      data: { position }
    }))
  );

  return json(await readWebPlaylist(user.id));
}

async function handlePlaylistTracks(request: Request) {
  const session = await getCurrentSession();
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return json({ error: "missing_playlist_id" }, { status: 400 });
  }

  const detail = await callWithUserCookie("/playlist/detail", session?.user.id, { id });
  if (detail.expired) return loginRequired();

  const playlist = asRecord(asRecord(detail.payload)?.playlist);
  let tracks = Array.isArray(playlist?.tracks) ? playlist?.tracks as SongRecord[] : [];
  const trackCount = readNumber(playlist?.trackCount) ?? tracks.length;

  if (trackCount > tracks.length) {
    const allTracks = await callWithUserCookie("/playlist/track/all", session?.user.id, {
      id,
      limit: 1000
    });

    if (allTracks.expired) return loginRequired();

    tracks = Array.isArray(asRecord(allTracks.payload)?.songs)
      ? asRecord(allTracks.payload)?.songs as SongRecord[]
      : tracks;
  }

  return json({
    playlist: playlist ? normalizePlaylist(playlist) : null,
    songs: tracks.map(normalizeSong)
  });
}

async function handleSongUrl(request: Request) {
  const session = await getCurrentSession();
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return json({ error: "missing_song_id" }, { status: 400 });
  }

  const result = await callWithUserCookie("/song/url/v1", session?.user.id, {
    id,
    level: searchParams.get("level") ?? "higher"
  }, {
    method: "GET"
  });

  if (result.expired) return loginRequired();

  const data = Array.isArray(asRecord(result.payload)?.data)
    ? asRecord(result.payload)?.data as Record<string, unknown>[]
    : [];
  const songUrl = data[0] ?? {};

  return json({
    id,
    url: readString(songUrl.url).trim() || null,
    level: readString(songUrl.level).trim() || null,
    type: readString(songUrl.type).trim() || null,
    size: readNumber(songUrl.size),
    code: readNumber(songUrl.code)
  });
}

async function handleLikeSong(request: Request) {
  const session = await getCurrentSession();
  const body = await readBody(request);
  const id = readId(body.id);

  if (!session?.user?.id) {
    return siteLoginRequired();
  }

  if (!id) {
    return json({ error: "missing_song_id" }, { status: 400 });
  }

  const account = await getStoredNeteaseAccount(session.user.id);
  if (!account) {
    return loginRequired();
  }

  const result = await callWithUserCookie("/like", session.user.id, {
    id,
    like: asBoolean(body.like, true)
  }, {
    method: "GET"
  });

  if (result.expired) return loginRequired();

  const code = getCode(result.payload);
  if (code !== 200) {
    return json({
      error: "netease_like_failed",
      message: readString(asRecord(result.payload)?.message || asRecord(result.payload)?.msg) || "网易云收藏失败。"
    }, { status: 502 });
  }

  return json({ ok: true, code });
}

async function handleLyric(request: Request) {
  const session = await getCurrentSession();
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!id) {
    return json({ error: "missing_song_id" }, { status: 400 });
  }

  const result = await callWithUserCookie("/lyric", session?.user.id, { id });
  if (result.expired) return loginRequired();

  return json({
    lyric: readString(asRecord(asRecord(result.payload)?.lrc)?.lyric),
    translatedLyric: readString(asRecord(asRecord(result.payload)?.tlyric)?.lyric)
  });
}

async function handleRequest(request: Request, context: MusicRouteContext) {
  const { music } = await context.params;
  const route = music.join("/");

  try {
    if (request.method === "GET" && route === "me") return await handleMe();
    if (request.method === "POST" && route === "login/qr/start") return await handleQrStart();
    if (request.method === "POST" && route === "login/qr/check") return await handleQrCheck(request);
    if (request.method === "POST" && route === "logout") return await handleLogout();
    if (request.method === "GET" && route === "search") return await handleSearch(request);
    if (request.method === "GET" && route === "album") return await handleAlbumTracks(request);
    if (request.method === "GET" && route === "playlists") return await handlePlaylists();
    if (request.method === "GET" && route === "playlist") return await handlePlaylistTracks(request);
    if (request.method === "GET" && route === "web-playlist") return await handleWebPlaylist();
    if (request.method === "POST" && route === "web-playlist/tracks") return await handleAddWebPlaylistTrack(request);
    if (request.method === "DELETE" && route === "web-playlist/tracks") return await handleRemoveWebPlaylistTrack(request);
    if (request.method === "POST" && route === "web-playlist/reorder") return await handleReorderWebPlaylistTracks(request);
    if (request.method === "GET" && route === "song-url") return await handleSongUrl(request);
    if (request.method === "POST" && route === "like") return await handleLikeSong(request);
    if (request.method === "GET" && route === "lyric") return await handleLyric(request);

    return json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    if (error instanceof NeteaseServiceError) {
      return json({
        error: error.code,
        message: error.message
      }, { status: error.status });
    }

    return json({
      error: "music_api_error",
      message: error instanceof Error ? error.message : "Unexpected music API error."
    }, { status: 500 });
  }
}

export async function GET(request: Request, context: MusicRouteContext) {
  return await handleRequest(request, context);
}

export async function POST(request: Request, context: MusicRouteContext) {
  return await handleRequest(request, context);
}

export async function DELETE(request: Request, context: MusicRouteContext) {
  return await handleRequest(request, context);
}
