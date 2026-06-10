import crypto from "crypto";
import type { Prisma } from "../generated/prisma/client";
import prisma from "./prisma";

type NeteasePrimitive = string | number | boolean | null | undefined;
type NeteaseParams = Record<string, NeteasePrimitive>;
type NeteaseRecord = Record<string, unknown>;

export type NeteaseProfile = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
};

export type StoredNeteaseAccount = {
  id: string;
  userId: string;
  cookie: string;
  profile: NeteaseProfile | null;
  loginStatus: string;
};

export class NeteaseServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = "netease_service_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let anonymousCookieCache: {
  cookie: string;
  expiresAt: number;
} | null = null;

function getApiBaseUrl() {
  return (process.env.NETEASE_API_BASE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}

function getEncryptionKey() {
  const secret = process.env.NETEASE_COOKIE_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new NeteaseServiceError("NETEASE_COOKIE_SECRET or BETTER_AUTH_SECRET is required.", 500, "netease_secret_missing");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCookie(cookie: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(cookie, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    cookieCiphertext: ciphertext.toString("base64"),
    cookieIv: iv.toString("base64"),
    cookieTag: tag.toString("base64")
  };
}

function decryptCookie(input: {
  cookieCiphertext: string;
  cookieIv: string;
  cookieTag: string;
}) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(input.cookieIv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.cookieTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.cookieCiphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function toBodyValue(value: NeteasePrimitive) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function asRecord(value: unknown): NeteaseRecord | null {
  return typeof value === "object" && value !== null ? value as NeteaseRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readId(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function extractSetCookie(headers: Headers) {
  const maybeHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = maybeHeaders.getSetCookie?.();

  if (setCookies && setCookies.length > 0) {
    return setCookies.map((item) => item.split(";")[0]).join("; ");
  }

  const header = headers.get("set-cookie");
  return header ? header.split(/,\s*/).map((item) => item.split(";")[0]).join("; ") : null;
}

export function extractCookie(payload: unknown, headers?: Headers) {
  const data = asRecord(payload);
  const cookie = readString(data?.cookie);

  if (cookie) return cookie;

  const cookies = Array.isArray(data?.cookies) ? data?.cookies : null;
  if (cookies) {
    const joined = cookies
      .map((item) => readString(item))
      .filter((item): item is string => Boolean(item))
      .join("; ");

    if (joined) return joined;
  }

  return headers ? extractSetCookie(headers) : null;
}

export function extractProfile(payload: unknown): NeteaseProfile | null {
  const root = asRecord(payload);
  const candidates = [
    asRecord(root?.profile),
    asRecord(asRecord(root?.account)?.profile),
    asRecord(asRecord(root?.data)?.profile),
    asRecord(root?.data),
    root
  ].filter((item): item is NeteaseRecord => Boolean(item));

  for (const candidate of candidates) {
    const userId = readId(candidate.userId ?? candidate.userID ?? candidate.id);
    const nickname = readString(candidate.nickname ?? candidate.name);

    if (userId && nickname) {
      return {
        userId,
        nickname,
        avatarUrl: readString(candidate.avatarUrl ?? candidate.avatar)
      };
    }
  }

  return null;
}

export async function requestNetease<T extends NeteaseRecord = NeteaseRecord>(
  path: string,
  params: NeteaseParams = {},
  options: { cookie?: string | null; method?: "GET" | "POST" } = {}
) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, getApiBaseUrl());
  const method = options.method ?? "POST";
  const requestParams = {
    ...params,
    timestamp: Date.now()
  };

  let response: Response;

  try {
    if (method === "GET") {
      Object.entries(requestParams).forEach(([key, value]) => {
        const bodyValue = toBodyValue(value);
        if (bodyValue !== null) url.searchParams.set(key, bodyValue);
      });
      if (options.cookie) url.searchParams.set("cookie", options.cookie);

      response = await fetch(url, {
        method,
        cache: "no-store"
      });
    } else {
      const body = new URLSearchParams();
      Object.entries(requestParams).forEach(([key, value]) => {
        const bodyValue = toBodyValue(value);
        if (bodyValue !== null) body.set(key, bodyValue);
      });
      if (options.cookie) body.set("cookie", options.cookie);

      response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body,
        cache: "no-store"
      });
    }
  } catch (error) {
    throw new NeteaseServiceError(
      error instanceof Error ? error.message : "Failed to reach NetEase API service.",
      503,
      "netease_unreachable"
    );
  }

  const text = await response.text();
  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new NeteaseServiceError(`NetEase API responded with ${response.status}.`, response.status);
  }

  return {
    payload: payload as T,
    cookie: extractCookie(payload, response.headers)
  };
}

export async function getStoredNeteaseAccount(userId: string): Promise<StoredNeteaseAccount | null> {
  const account = await prisma.neteaseAccount.findUnique({
    where: { userId }
  });

  if (!account || account.loginStatus !== "active") return null;

  return {
    id: account.id,
    userId: account.userId,
    cookie: decryptCookie(account),
    profile: account.neteaseUserId && account.nickname
      ? {
          userId: account.neteaseUserId,
          nickname: account.nickname,
          avatarUrl: account.avatarUrl
        }
      : null,
    loginStatus: account.loginStatus
  };
}

export async function saveStoredNeteaseAccount(input: {
  userId: string;
  cookie: string;
  profile: NeteaseProfile | null;
  rawProfile?: Prisma.InputJsonValue;
}) {
  const encrypted = encryptCookie(input.cookie);
  const now = new Date();

  return await prisma.neteaseAccount.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      neteaseUserId: input.profile?.userId ?? null,
      nickname: input.profile?.nickname ?? null,
      avatarUrl: input.profile?.avatarUrl ?? null,
      profile: input.rawProfile,
      loginStatus: "active",
      lastValidatedAt: now,
      ...encrypted
    },
    update: {
      neteaseUserId: input.profile?.userId ?? null,
      nickname: input.profile?.nickname ?? null,
      avatarUrl: input.profile?.avatarUrl ?? null,
      profile: input.rawProfile,
      loginStatus: "active",
      lastValidatedAt: now,
      ...encrypted
    }
  });
}

export async function markStoredNeteaseAccountExpired(userId: string) {
  await prisma.neteaseAccount.updateMany({
    where: { userId },
    data: {
      loginStatus: "expired",
      lastValidatedAt: new Date()
    }
  });
}

export async function deleteStoredNeteaseAccount(userId: string) {
  await prisma.neteaseAccount.deleteMany({
    where: { userId }
  });
}

export async function getAnonymousNeteaseCookie() {
  if (anonymousCookieCache && anonymousCookieCache.expiresAt > Date.now()) {
    return anonymousCookieCache.cookie;
  }

  try {
    const response = await requestNetease("/register/anonimous");
    const cookie = response.cookie;

    if (!cookie) return null;

    anonymousCookieCache = {
      cookie,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000
    };

    return cookie;
  } catch {
    return null;
  }
}

export function isLoginExpiredPayload(payload: unknown) {
  const data = asRecord(payload);
  const code = data?.code;

  return code === 301
    || code === 401
    || code === -462
    || readString(data?.message)?.includes("登录") === true
    || readString(data?.msg)?.includes("登录") === true;
}
