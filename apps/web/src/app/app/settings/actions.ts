"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireUser, startSession } from "@/lib/auth";
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
