import { createHmac, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived, single-use ticket that lets one signed-in dashboard user open a
 * live LinkedIn login browser for ONE account of THEIR workspace. The web app
 * signs it after checking the account belongs to the workspace; the worker
 * verifies it, re-checks the account, and accepts each ticket only once.
 */
export interface ConnectClaims {
  accountId: string;
  workspaceId: string;
  userId: string;
  /** Unique id — the worker refuses a ticket it has seen before. */
  ticketId: string;
}

const AUDIENCE = "invytra-connect";
export const CONNECT_TICKET_SECONDS = 120;

function ticketKey(sessionEncryptionKey: string): Uint8Array {
  const base = Buffer.from(sessionEncryptionKey, "base64");
  if (base.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes (base64)");
  return new Uint8Array(createHmac("sha256", base).update("invytra-connect-ticket-v1").digest());
}

export async function signConnectTicket(
  claims: Omit<ConnectClaims, "ticketId">,
  sessionEncryptionKey: string,
): Promise<string> {
  return new SignJWT({ aid: claims.accountId, wid: claims.workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${CONNECT_TICKET_SECONDS}s`)
    .sign(ticketKey(sessionEncryptionKey));
}

export async function verifyConnectTicket(token: string, sessionEncryptionKey: string): Promise<ConnectClaims | null> {
  try {
    const { payload } = await jwtVerify(token, ticketKey(sessionEncryptionKey), { algorithms: ["HS256"], audience: AUDIENCE });
    const { aid, wid, sub, jti } = payload as Record<string, unknown>;
    if (typeof aid !== "string" || typeof wid !== "string" || typeof sub !== "string" || typeof jti !== "string") return null;
    return { accountId: aid, workspaceId: wid, userId: sub, ticketId: jti };
  } catch {
    return null;
  }
}
