import { Secret, TOTP, URI } from "otpauth";
import { Root } from "protobufjs/light";

export type OtpEntry = {
  label: string;
  issuer: string;
  secret: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 6 | 8;
  period: number;
};
export type SavedOtpEntry = OtpEntry & { id: string };
export type ImportPart = { entries: OtpEntry[]; batch?: { id: number; size: number; index: number } };
export class OtpInputError extends Error {}

export function normalizeEntry(value: unknown): OtpEntry {
  if (!value || typeof value !== "object") throw new OtpInputError("账号数据无效。");
  const v = value as Record<string, unknown>;
  if (typeof v.secret !== "string") throw new OtpInputError("请输入 Base32 密钥。");
  const secret = v.secret.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]{16,1024}$/.test(secret)) throw new OtpInputError("密钥应为至少 16 位的 Base32 字符串（A–Z、2–7），不是六位验证码。");
  const decoded = Secret.fromBase32(secret);
  if (decoded.base32 !== secret) throw new OtpInputError("密钥的 Base32 编码不完整或无效。");
  const label = typeof v.label === "string" ? v.label.trim() : "";
  const issuer = typeof v.issuer === "string" ? v.issuer.trim() : "";
  if (!label || label.length > 160 || issuer.length > 160) throw new OtpInputError("请填写账号名称，名称和服务商均不能超过 160 字。");
  const algorithm = v.algorithm ?? "SHA1";
  const digits = v.digits ?? 6;
  const period = v.period ?? 30;
  if (algorithm !== "SHA1" && algorithm !== "SHA256" && algorithm !== "SHA512") throw new OtpInputError("仅支持 SHA1、SHA256、SHA512 算法。");
  if (digits !== 6 && digits !== 8) throw new OtpInputError("仅支持六位或八位验证码。");
  if (typeof period !== "number" || !Number.isInteger(period) || period < 5 || period > 300) throw new OtpInputError("刷新周期须为 5–300 秒的整数。");
  return { label, issuer, secret, algorithm, digits, period };
}

// Wire format documented by https://github.com/dim13/otpauth/blob/master/migration/migration.proto.
const payloadType = Root.fromJSON({ nested: {
  OtpParameters: { fields: {
    secret: { type: "bytes", id: 1 }, name: { type: "string", id: 2 }, issuer: { type: "string", id: 3 },
    algorithm: { type: "int32", id: 4 }, digits: { type: "int32", id: 5 }, type: { type: "int32", id: 6 }
  } },
  Payload: { fields: {
    otpParameters: { rule: "repeated", type: "OtpParameters", id: 1 }, version: { type: "int32", id: 2 },
    batchSize: { type: "int32", id: 3 }, batchIndex: { type: "int32", id: 4 }, batchId: { type: "int32", id: 5 }
  } }
} }).lookupType("Payload");

type Migration = {
  otpParameters?: { secret: Uint8Array; name?: string; issuer?: string; algorithm?: number; digits?: number; type?: number }[];
  version?: number; batchSize?: number; batchIndex?: number; batchId?: number;
};

export function parseImport(text: string, label = "", issuer = ""): ImportPart {
  if (!text.trim() || text.length > 100_000) throw new OtpInputError("导入内容为空或过长。");
  const input = text.trim();
  if (!input.includes(":")) return { entries: [normalizeEntry({ secret: input, label, issuer })] };
  try {
    const url = new URL(input);
    if (url.protocol === "otpauth:") {
      if (url.hostname !== "totp") throw new OtpInputError("暂不支持按次数生成的 HOTP 账号，请导入 TOTP 账号。");
      if (!url.searchParams.get("secret")) throw new OtpInputError("链接中缺少密钥。");
      const otp = URI.parse(input);
      if (!(otp instanceof TOTP)) throw new OtpInputError("仅支持 TOTP 账号。");
      return { entries: [normalizeEntry({ label: otp.label, issuer: otp.issuer, secret: otp.secret.base32, algorithm: otp.algorithm, digits: otp.digits, period: otp.period })] };
    }
    if (url.protocol !== "otpauth-migration:" || url.hostname !== "offline") throw new OtpInputError("请粘贴 Base32 密钥、otpauth 链接或 Google Authenticator 导出链接。");
    const data = url.searchParams.get("data")?.replace(/ /g, "+");
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new OtpInputError("迁移二维码数据无效。");
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const payload = payloadType.decode(bytes) as unknown as Migration;
    if ((payload.version ?? 0) > 1 || (payload.version ?? 0) < 0) throw new OtpInputError("暂不支持此版本的 Google Authenticator 导出格式。");
    const size = payload.batchSize || 1;
    const index = payload.batchIndex ?? 0;
    if (size < 1 || size > 100 || index < 0 || index >= size) throw new OtpInputError("迁移二维码的批次信息无效。");
    if (!payload.otpParameters?.length || payload.otpParameters.length > 100) throw new OtpInputError("每张二维码须包含 1–100 个账号。");
    const entries = payload.otpParameters.map(p => {
      if (p.type !== 2) throw new OtpInputError("二维码含有不支持的 HOTP 或未知类型账号；请在 Google Authenticator 中仅选择 TOTP 账号重新导出。");
      const algorithm = ({ 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" } as const)[p.algorithm ?? 0];
      const digits = ({ 0: 6, 1: 6, 2: 8 } as const)[p.digits ?? 0];
      if (!algorithm || !digits || !p.secret?.length) throw new OtpInputError("二维码包含不支持的算法、位数或空密钥。");
      const service = p.issuer ?? "";
      const name = p.name ?? "";
      return normalizeEntry({ secret: new Secret({ buffer: Uint8Array.from(p.secret).buffer }).base32,
        label: service && name.startsWith(`${service}:`) ? name.slice(service.length + 1) : name,
        issuer: service, algorithm, digits, period: 30 });
    });
    return { entries, batch: { id: payload.batchId ?? 0, size, index } };
  } catch (error) {
    if (error instanceof OtpInputError) throw error;
    throw new OtpInputError("无法解析导入内容，请检查链接或二维码是否完整。");
  }
}

export function entryIdentity(entry: OtpEntry) {
  return JSON.stringify([entry.secret, entry.algorithm, entry.digits, entry.period]);
}

export function assembleParts(parts: ImportPart[]) {
  const batches = new Map<number, { size: number; indices: Set<number> }>();
  for (const part of parts) {
    if (!part.batch) continue;
    const { id, size, index } = part.batch;
    const batch = batches.get(id) ?? { size, indices: new Set<number>() };
    if (batch.size !== size) throw new OtpInputError("二维码批次冲突，请清空后重新扫描同一次导出的二维码。");
    batch.indices.add(index);
    batches.set(id, batch);
  }
  const missing = [...batches.values()].reduce((count, batch) => count + batch.size - batch.indices.size, 0);
  const entries = [...new Map(parts.flatMap(p => p.entries).map(e => [entryIdentity(e), e])).values()];
  if (entries.length > 500) throw new OtpInputError("一次最多导入 500 个账号。");
  return { entries, missing };
}
