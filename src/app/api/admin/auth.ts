import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const cookieName = "hakurei_admin_session";
const sessionMaxAge = 60 * 60 * 8;

function getAccessToken() {
  return process.env.ADMIN_ACCESS_TOKEN ?? "hzlgames";
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET ?? getAccessToken();
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function verifyAccessToken(input: unknown) {
  if (typeof input !== "string") {
    return false;
  }

  return safeEqual(input, getAccessToken());
}

export async function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionMaxAge;
  const payload = `${expiresAt}.${randomBytes(16).toString("hex")}`;
  const value = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();

  cookieStore.set(cookieName, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionMaxAge,
    path: "/"
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const value = cookieStore.get(cookieName)?.value;

  if (!value) {
    return false;
  }

  const parts = value.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtText, nonce, signature] = parts;
  const expiresAt = Number(expiresAtText);
  const payload = `${expiresAtText}.${nonce}`;

  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  return safeEqual(signature, sign(payload));
}
