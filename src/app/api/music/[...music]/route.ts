import { NextResponse } from "next/server";
import type { Prisma } from "../../../../generated/prisma/client";
import { getCurrentSession } from "../../../../lib/admin";
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

function getCode(payload: unknown) {
  return readNumber(asRecord(payload)?.code);
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
  params: Record<string, string | number | boolean | null | undefined> = {}
) {
  const access = await getNeteaseCookie(userId);
  const response = await requestNetease(path, params, { cookie: access.cookie });

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

  if (!keywords) {
    return json({ songs: [] });
  }

  const result = await callWithUserCookie("/cloudsearch", session?.user.id, {
    keywords,
    limit: Math.min(Number(searchParams.get("limit") ?? 20), 50),
    offset: Math.max(Number(searchParams.get("offset") ?? 0), 0),
    type: 1
  });

  if (result.expired) return loginRequired();

  const songs = Array.isArray(asRecord(asRecord(result.payload)?.result)?.songs)
    ? asRecord(asRecord(result.payload)?.result)?.songs as SongRecord[]
    : [];

  return json({
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
    if (request.method === "GET" && route === "playlists") return await handlePlaylists();
    if (request.method === "GET" && route === "playlist") return await handlePlaylistTracks(request);
    if (request.method === "GET" && route === "song-url") return await handleSongUrl(request);
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
