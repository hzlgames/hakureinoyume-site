import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { entryIdentity, type OtpEntry } from "./core";

function key() {
  const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Two-factor encryption key is not configured.");
  return Buffer.from(hkdfSync("sha256", secret, "hakureinoyume", "two-factor-v1", 32));
}
function aad(userId: string, id: string) { return Buffer.from(JSON.stringify(["two-factor-v1", userId, id])); }
export function encryptEntry(entry: OtpEntry, userId: string, id: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(userId, id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(entry), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
export function decryptEntry(row: { ciphertext: string; iv: string; tag: string; userId: string; id: string }): OtpEntry {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(row.iv, "base64"));
  decipher.setAAD(aad(row.userId, row.id));
  decipher.setAuthTag(Buffer.from(row.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}
export function entryFingerprint(entry: OtpEntry, userId: string) {
  return createHmac("sha256", key()).update(JSON.stringify([userId, entryIdentity(entry)])).digest("hex");
}
