"use server";

import { prisma } from "@invytra/db";
import { revalidatePath } from "next/cache";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import { mailboxSettingsSchema, warmupSettingsSchema } from "@invytra/shared";
import { saveWarmupSettings } from "@/lib/warmup";
import { sendTestEmail, setMailboxPaused, testEmailSchema, updateMailboxSettings } from "@/lib/mailbox-sending";
import { connectMailbox, connectMailboxSchema, recheckMailbox, removeMailbox, type ConnectResult } from "@/lib/mailboxes";

/* Email Outreach actions: each checks the signed-in user may use the Email channel, and only touches their workspace. */

export async function connectMailboxAction(input: unknown): Promise<Result<ConnectResult>> {
  const me = await requireChannel("email");
  const parsed = connectMailboxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await connectMailbox(prisma, me.workspace.id, parsed.data);
  if (r.ok && r.value.id) revalidatePath("/email", "layout");
  return r;
}

export async function recheckMailboxAction(id: string): Promise<Result<ConnectResult>> {
  const me = await requireChannel("email");
  const r = await recheckMailbox(prisma, me.workspace.id, String(id));
  revalidatePath("/email", "layout");
  return r;
}

export async function removeMailboxAction(id: string): Promise<Result> {
  const me = await requireChannel("email");
  const r = await removeMailbox(prisma, me.workspace.id, String(id));
  revalidatePath("/email", "layout");
  return r;
}

export async function saveMailboxSettingsAction(id: string, input: unknown): Promise<Result> {
  const me = await requireChannel("email");
  const parsed = mailboxSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await updateMailboxSettings(prisma, me.workspace.id, String(id), parsed.data);
  revalidatePath("/email", "layout");
  return r;
}

export async function pauseMailboxAction(id: string, paused: boolean): Promise<Result> {
  const me = await requireChannel("email");
  const r = await setMailboxPaused(prisma, me.workspace.id, String(id), paused === true);
  revalidatePath("/email", "layout");
  return r;
}

export async function sendTestEmailAction(id: string, input: unknown): Promise<Result<{ messageId: string }>> {
  const me = await requireChannel("email");
  const parsed = testEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await sendTestEmail(prisma, me.workspace.id, String(id), parsed.data.to);
  revalidatePath("/email", "layout");
  return r;
}

export async function saveWarmupAction(id: string, input: unknown): Promise<Result> {
  const me = await requireChannel("email");
  const parsed = warmupSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const r = await saveWarmupSettings(prisma, me.workspace.id, String(id), parsed.data);
  revalidatePath("/email", "layout");
  return r;
}
