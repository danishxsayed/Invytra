"use server";

import { prisma, signConnectTicket } from "@invytra/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  AccountNotFoundError,
  createAccount,
  getAccount,
  newAccountSchema,
  removeAccount,
  resumeAfterCheck,
  setPaused,
  settingsSchema,
  updateSettings,
  type Result,
} from "@/lib/accounts";

/*
 * Every action re-reads the signed-in user and passes THEIR workspace id;
 * account ids from the browser are checked against it in lib/accounts.
 */

function refresh(id?: string) {
  revalidatePath("/app", "layout");
  if (id) revalidatePath(`/app/accounts/${id}`);
}

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountNotFoundError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function addAccountAction(input: unknown): Promise<Result<string>> {
  const me = await requireUser();
  const parsed = newAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await createAccount(prisma, me.workspace.id, parsed.data);
  if (r.ok) refresh(r.value);
  return r;
}

export async function saveSettingsAction(accountId: string, input: unknown): Promise<Result> {
  const me = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await guarded(() => updateSettings(prisma, me.workspace.id, String(accountId), parsed.data));
  if (r.ok) refresh(accountId);
  return r;
}

export async function pauseAction(accountId: string, paused: boolean): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => setPaused(prisma, me.workspace.id, String(accountId), !!paused));
  if (r.ok) refresh(accountId);
  return r;
}

export async function resumeAfterCheckAction(accountId: string): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => resumeAfterCheck(prisma, me.workspace.id, String(accountId)));
  if (r.ok) refresh(accountId);
  return r;
}

export async function removeAccountAction(accountId: string): Promise<Result> {
  const me = await requireUser();
  const r = await guarded(() => removeAccount(prisma, me.workspace.id, String(accountId)));
  if (r.ok) refresh();
  return r;
}

/** A one-time, 2-minute ticket for the live login window of ONE account in the user's workspace. */
export async function startConnectAction(accountId: string): Promise<Result<{ url: string }>> {
  const me = await requireUser();
  return guarded(async () => {
    const a = await getAccount(prisma, me.workspace.id, String(accountId));
    const ticket = await signConnectTicket(
      { accountId: a.id, workspaceId: me.workspace.id, userId: me.user.id },
      process.env.SESSION_ENCRYPTION_KEY ?? "",
    );
    const base = (process.env.CONNECT_WS_URL ?? "ws://localhost:3001").replace(/\/$/, "");
    return { ok: true, value: { url: `${base}/connect?ticket=${encodeURIComponent(ticket)}` } };
  });
}

/** Called by the login window when it finishes, so pages show the new status. */
export async function connectFinishedAction(accountId: string): Promise<void> {
  await requireUser();
  refresh(String(accountId));
}
