import "server-only";
import { prisma, type MemberRole } from "@invytra/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authKey, isProduction } from "./env";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session-token";

export interface CurrentUser {
  user: { id: string; name: string; email: string };
  workspace: { id: string; name: string; plan: string };
  role: MemberRole;
}

export async function startSession(userId: string, workspaceId: string): Promise<void> {
  const token = await signSession({ userId, workspaceId }, authKey());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
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
  return {
    user: { id: user.id, name: user.name, email: user.email },
    workspace: { id: workspace.id, name: workspace.name, plan: workspace.plan },
    role: membership.role,
  };
});

/** Use at the top of every signed-in page and server action. */
export async function requireUser(): Promise<CurrentUser> {
  const me = await currentUser();
  if (!me) redirect("/login");
  return me;
}
