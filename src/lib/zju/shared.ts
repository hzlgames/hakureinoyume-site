// ZJU 工具通用底座：加密、凭据类型、login-zju 客户端构建、解析与文件名/路径辅助。
import crypto from "crypto";
import type { Prisma } from "../../generated/prisma/client";

type CoursesClient = import("login-zju").COURSES;
type LibClient = import("login-zju").APILIB;

type StoredZjuSecret = {
  username: string;
  password: string;
  pintiaCookie: string | null;
};

function getEncryptionKey() {
  const secret = process.env.ZJU_ACCOUNT_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error("ZJU_ACCOUNT_SECRET or BETTER_AUTH_SECRET is required.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

function decryptSecret(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(input.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
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

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function byteToSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Math.round(bytes / Math.pow(1024, index))} ${units[index]}`;
}

function buildCoursesClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ COURSES, ZJUAM }) => {
    return new COURSES(new ZJUAM(secret.username, secret.password));
  });
}

function buildClassroomClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ CLASSROOM, ZJUAM }) => {
    return new CLASSROOM(new ZJUAM(secret.username, secret.password));
  });
}

function buildLibClient(secret: StoredZjuSecret) {
  return import("login-zju").then(({ APILIB, ZJUAM }) => {
    return new APILIB(new ZJUAM(secret.username, secret.password));
  });
}

async function requestJson<T>(client: CoursesClient, url: string, init?: RequestInit): Promise<T> {
  const response = await client.fetch(url, init);

  if (!response.ok) {
    throw new Error(`courses.zju request failed: ${response.status}`);
  }

  return await response.json() as T;
}

function materialFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "material";
}

function uniqueMaterialFileName(name: string, usedNames: Set<string>) {
  const safeName = materialFileName(name);
  const dotIndex = safeName.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < safeName.length - 1;
  const baseName = hasExtension ? safeName.slice(0, dotIndex) : safeName;
  const extension = hasExtension ? safeName.slice(dotIndex) : "";
  let candidate = safeName;
  let index = 2;

  while (usedNames.has(candidate)) {
    candidate = `${baseName}-${index}${extension}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function getZjuDataRoot() {
  return process.env.ZJU_TOOL_DATA_DIR ?? `${process.cwd()}/.data/zju-tools`;
}

function pathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
}

function stripHtmlTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export {
  asRecord, buildClassroomClient, buildCoursesClient, buildLibClient, byteToSize,
  decryptSecret, encryptSecret, getZjuDataRoot, materialFileName, pathSegment,
  readNumber, readString, requestJson, stripHtmlTags, toJsonValue, uniqueMaterialFileName
};
export type { CoursesClient, LibClient, StoredZjuSecret };
