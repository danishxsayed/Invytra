import "server-only";
import { prisma, type MemberRole } from "@invytra/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { canUseChannel, channelById, type ChannelId } from "@invytra/shared";
import { cookieDomain, hubHref } from "./domains";
import { authKey, secureCookies } from "./env";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session-token";

export interface CurrentUser {
  /** onboarded: answered (or skipped) the questions after sign-up. */
  user: { id: string; name: string; email: string; onboarded: boolean };
  /** channels: the outreach channels its subscription includes. */
  workspace: { id: string; name: string; plan: string; channels: string[] };
  role: MemberRole;
}

/**
 * One sign-in for the whole platform: with ROOT_DOMAIN set the cookie is on the parent
 * domain (.invytra.com), so the hub and every channel subdomain see the same session.
 * It only holds the user and workspace ids, signed; everything else is read fresh.
 */
export async function startSession(userId: string, workspaceId: string): Promise<void> {
  const token = await signSession({ userId, workspaceId }, authKey());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    domain: cookieDomain(),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  // Expire it with the same Domain it was set with, or the browser keeps it.
  jar.set(SESSION_COOKIE, "", { path: "/", domain: cookieDomain(), maxAge: 0, httpOnly: true, sameSite: "lax", secure: secureCookies });
}

/**
 * The signed-in user and their workspace, re-checked against the database on
 * every request (so removing someone from a workspace takes effect at once).
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, authKey());
  if (!claims) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId: claims.userId, workspaceId: claims.workspaceId } },
    include: { user: true, workspace: true },
  });
  if (!membership) return null;
  const { user, workspace } = membership;
  // Signed out everywhere (password change or "sign out other devices"): older sessions stop working.
  if (user.sessionsValidAfter && (claims.issuedAt ?? 0) < user.sessionsValidAfter.getTime()) return null;
  return {
    user: { id: user.id, name: user.name, email: user.email, onboarded: !!user.onboardedAt },
    workspace: { id: workspace.id, name: workspace.name, plan: workspace.plan, channels: workspace.channels },
    role: membership.role,
  };
});

/** Use at the top of every signed-in page and server action. */
export async function requireUser(): Promise<CurrentUser> {
  const me = await currentUser();
  if (!me) redirect("/login");
  return me;
}

/**
 * Use at the top of every page and server action of a channel: signed in, and this
 * workspace's subscription includes the channel (and it has launched). Otherwise back to
 * the workspace hub, which says why.
 */
export async function requireChannel(id: ChannelId): Promise<CurrentUser> {
  const me = await requireUser();
  if (!canUseChannel(channelById(id), me.workspace.channels)) redirect(hubHref(`/?denied=${id}`));
  return me;
}
