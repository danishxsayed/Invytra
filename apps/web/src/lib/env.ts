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

/**
 * Login cookies are "Secure" (HTTPS only) on the real site. A production build run on
 * your own computer (http://localhost, `pnpm web`) must not set it, or Safari drops the
 * cookie and you can't log in. WEB_ORIGIN is the dashboard's address (https://… when live).
 */
export const secureCookies = isProduction && (process.env.WEB_ORIGIN ?? "http://localhost:3000").startsWith("https://");
