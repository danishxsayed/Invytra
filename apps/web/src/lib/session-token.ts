import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "invytra_session";
export const SESSION_DAYS = 14;

export interface SessionClaims {
  userId: string;
  workspaceId: string;
}

/** Signed (HS256) session token. Holds ids only — never secrets or personal data. */
export async function signSession(claims: SessionClaims, key: Uint8Array): Promise<string> {
  return new SignJWT({ wid: claims.workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

export async function verifySession(token: string | undefined, key: Uint8Array): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.wid !== "string") return null;
    return { userId: payload.sub, workspaceId: payload.wid };
  } catch {
    return null;
  }
}
