import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Small secrets stored in a text column (e.g. a proxy URL with its password),
 * encrypted with AES-256-GCM under SESSION_ENCRYPTION_KEY.
 * Format: "enc:v1:" + base64([12-byte IV][16-byte tag][ciphertext]).
 * Values without the prefix are treated as plain text (accounts from .env).
 */
const PREFIX = "enc:v1:";

function key(base64Key: string): Buffer {
  const k = Buffer.from(base64Key, "base64");
  if (k.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function sealSecret(plain: string, base64Key: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(base64Key), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function openSecret(value: string, base64Key: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const blob = Buffer.from(value.slice(PREFIX.length), "base64");
  const d = createDecipheriv("aes-256-gcm", key(base64Key), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString("utf8");
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}
