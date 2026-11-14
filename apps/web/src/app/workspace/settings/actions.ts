"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { endSession, requireUser, startSession } from "@/lib/auth";
import { deleteWorkspace } from "@/lib/delete-workspace";
import { platformMailer } from "@/lib/platform-mail";
import { cancelInvite, inviteMember, removeMember } from "@/lib/team";
import { changePassword, passwordSchema, profileSchema, renameWorkspace, signOutEverywhere, updateProfile, workspaceSchema } from "@/lib/settings";

const first = (e: { issues: { message: string }[] }) => e.issues[0]!.message;

export async function saveProfileAction(input: unknown): Promise<Result> {
  const me = await requireUser();
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: first(p.error) };
  const r = await updateProfile(prisma, me.user.id, p.data);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}

export async function changePasswordAction(input: unknown): Promise<Result> {
  const me = await requireUser();
  const p = passwordSchema.safeParse(input);
  if (!p.success) return { ok: false, error: first(p.error) };
  const r = await changePassword(prisma, me.user.id, p.data);
  if (r.ok) await startSession(me.user.id, me.workspace.id); // keep this browser signed in
  return r;
}

export async function signOutOthersAction(): Promise<Result> {
  const me = await requireUser();
  const r = await signOutEverywhere(prisma, me.user.id);
  await startSession(me.user.id, me.workspace.id);
  return r;
}

export async function renameWorkspaceAction(input: unknown): Promise<Result> {
  const me = await requireUser();
  const p = workspaceSchema.safeParse(input);
  if (!p.success) return { ok: false, error: first(p.error) };
  const r = await renameWorkspace(prisma, me.workspace.id, me.role, p.data);
  if (r.ok) revalidatePath("/app", "layout");
  return r;
}

/** Deletes the whole workspace (owner, with its name and their password), then signs out. */
export async function deleteWorkspaceAction(input: unknown): Promise<Result> {
  const me = await requireUser();
  const p = z.object({ name: z.string().max(120), password: z.string().max(200) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Type the workspace name and your password." };
  const r = await deleteWorkspace(prisma, { userId: me.user.id, workspaceId: me.workspace.id, role: me.role }, p.data);
  if (!r.ok) return r;
  await endSession();
  redirect("/login?deleted=1");
}

const NOT_OWNER = { ok: false as const, error: "Only the workspace owner can manage the team." };

/** Invites a teammate by email (or sends a fresh link to someone already invited). */
export async function inviteMemberAction(email: string): Promise<Result<{ resent: boolean }>> {
  const me = await requireUser();
  if (me.role !== "OWNER") return NOT_OWNER;
  const r = await inviteMember(prisma, me.workspace.id, { id: me.user.id, name: me.user.name }, String(email ?? ""), platformMailer());
  revalidatePath("/", "layout");
  return r;
}

export async function cancelInviteAction(inviteId: string): Promise<Result> {
  const me = await requireUser();
  if (me.role !== "OWNER") return NOT_OWNER;
  const r = await cancelInvite(prisma, me.workspace.id, String(inviteId));
  revalidatePath("/", "layout");
  return r;
}

export async function removeMemberAction(userId: string): Promise<Result> {
  const me = await requireUser();
  if (me.role !== "OWNER") return NOT_OWNER;
  const r = await removeMember(prisma, me.workspace.id, me.user.id, String(userId));
  revalidatePath("/", "layout");
  return r;
}
