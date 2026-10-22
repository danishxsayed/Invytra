import "server-only";
import { createHmac } from "node:crypto";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing from .env`);
  return v;
}

/**
 * Key for signing login sessions, derived from SESSION_ENCRYPTION_KEY so there
 * is no extra secret to manage. Changing that key logs everyone out (and makes
 * saved LinkedIn sessions unreadable), so it must stay stable.
 */
export function authKey(): Uint8Array {
  const base = Buffer.from(required("SESSION_ENCRYPTION_KEY"), "base64");
  return new Uint8Array(createHmac("sha256", base).update("invytra-dashboard-session-v1").digest());
}

export const isProduction = process.env.NODE_ENV === "production";
