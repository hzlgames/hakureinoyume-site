import test from "node:test";
import assert from "node:assert/strict";
import { Secret, TOTP } from "otpauth";
import { Writer } from "protobufjs/minimal";
import { assembleParts, normalizeEntry, parseImport } from "../src/lib/two-factor/core";
import { decryptEntry, encryptEntry, entryFingerprint } from "../src/lib/two-factor/crypto";

const secret = "JBSWY3DPEHPK3PXP";
const entry = normalizeEntry({ label: "alice@example.test", issuer: "Example", secret });
function migration(options: { size?: number; index?: number; algorithm?: number; digits?: number; type?: number; version?: number; id?: number } = {}) {
  const param = Writer.create().uint32(10).bytes(Buffer.from("Hello!\xde\xad\xbe\xef", "latin1")).uint32(18).string("Example:alice@example.test").uint32(26).string("Example")
    .uint32(32).int32(options.algorithm ?? 1).uint32(40).int32(options.digits ?? 1).uint32(48).int32(options.type ?? 2).finish();
  const data = Writer.create().uint32(10).bytes(param).uint32(16).int32(options.version ?? 1).uint32(24).int32(options.size ?? 1).uint32(32).int32(options.index ?? 0).uint32(40).int32(options.id ?? 42).finish();
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(data).toString("base64"))}`;
}

test("RFC 6238 vectors for SHA1, SHA256 and SHA512, including rollover", () => {
  const vectors = [
    ["SHA1", "12345678901234567890", "94287082", "07081804"],
    ["SHA256", "12345678901234567890123456789012", "46119246", "68084774"],
    ["SHA512", "1234567890".repeat(6) + "1234", "90693936", "25091201"]
  ];
  for (const [algorithm, seed, at59, at1111111109] of vectors) {
    const otp = new TOTP({ secret: Secret.fromUTF8(seed), algorithm, digits: 8, period: 30 });
    assert.equal(otp.generate({ timestamp: 59_000 }), at59);
    assert.equal(otp.generate({ timestamp: 1111111109_000 }), at1111111109);
    assert.notEqual(otp.generate({ timestamp: 59_999 }), otp.generate({ timestamp: 60_000 }));
  }
});
test("manual Base32 normalization, URI parameters and malformed inputs", () => {
  assert.equal(parseImport("jbsw y3dp-ehpk3pxp", "Alice").entries[0].secret, secret);
  const parsed = parseImport(`otpauth://totp/Example:Alice?secret=${secret}&issuer=Example&algorithm=SHA256&digits=8&period=60`).entries[0];
  assert.deepEqual(parsed, { secret, label: "Alice", issuer: "Example", algorithm: "SHA256", digits: 8, period: 60 });
  for (const text of ["123456", "ABCDEFGH!2345678", `otpauth://hotp/Alice?secret=${secret}&counter=0`, "https://example.test/", "otpauth://totp/Alice", "otpauth-migration://offline?data=%%%", "otpauth-migration://offline?data=Cg=="]) {
    assert.throws(() => parseImport(text, "Alice"));
  }
  assert.throws(() => parseImport(secret));
  assert.throws(() => normalizeEntry({ ...entry, algorithm: "MD5" }));
  assert.throws(() => normalizeEntry({ ...entry, digits: 7 }));
  assert.throws(() => normalizeEntry({ ...entry, period: 0 }));
});
test("Google migration public fixture, defaults and explicit algorithms", () => {
  const fixture = "otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZTAC";
  assert.equal(parseImport(fixture).entries[0].secret, secret);
  assert.equal(parseImport(fixture).entries[0].label, "alice@google.com");
  const parsed = parseImport(migration({ algorithm: 3, digits: 2 })).entries[0];
  assert.equal(parsed.algorithm, "SHA512"); assert.equal(parsed.digits, 8);
  for (const options of [{ algorithm: 4 }, { type: 1 }, { type: 0 }, { digits: 3 }, { version: 2 }, { size: 2, index: 2 }]) assert.throws(() => parseImport(migration(options)));
});
test("multi-QR completeness, duplicate scans and batch conflict", () => {
  const first = parseImport(migration({ size: 2, index: 0 }));
  const second = parseImport(migration({ size: 2, index: 1 }));
  assert.equal(assembleParts([first]).missing, 1);
  const complete = assembleParts([first, first, second]);
  assert.equal(complete.missing, 0); assert.equal(complete.entries.length, 1);
  assert.throws(() => assembleParts([first, parseImport(migration({ size: 3 }))]));
});
test("encrypted entries bind to owner and row; ciphertext tampering fails; fingerprints are user-scoped", () => {
  process.env.TWO_FACTOR_ENCRYPTION_KEY = "fixture-only-encryption-key-32-characters-long";
  const encrypted = encryptEntry(entry, "user-a", "row-a");
  assert(!encrypted.ciphertext.includes(secret));
  assert.deepEqual(decryptEntry({ ...encrypted, userId: "user-a", id: "row-a" }), entry);
  assert.notEqual(encryptEntry(entry, "user-a", "row-a").ciphertext, encrypted.ciphertext);
  assert.throws(() => decryptEntry({ ...encrypted, userId: "user-b", id: "row-a" }));
  assert.throws(() => decryptEntry({ ...encrypted, userId: "user-a", id: "row-b" }));
  const tampered = Buffer.from(encrypted.ciphertext, "base64"); tampered[0] ^= 1;
  assert.throws(() => decryptEntry({ ...encrypted, ciphertext: tampered.toString("base64"), userId: "user-a", id: "row-a" }));
  assert.notEqual(entryFingerprint(entry, "user-a"), entryFingerprint(entry, "user-b"));
  assert.equal(entryFingerprint(entry, "user-a"), entryFingerprint({ ...entry, label: "renamed" }, "user-a"));
});
