"use server";

import { prisma } from "@invytra/db";
import { emailSequenceSchema } from "@invytra/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import {
  campaignNameSchema,
  createEmailCampaign,
  deleteEmailCampaign,
  importEmailLeads,
  launchEmailCampaign,
  renameEmailCampaign,
  saveEmailSequence,
  setCampaignMailboxes,
  setEmailCampaignPaused,
  type LeadImportResult,
} from "@/lib/email-campaigns";

/* Email campaign actions: Email channel only, and only the signed-in workspace's campaigns. */

const done = <T>(r: Result<T>) => {
  revalidatePath("/email", "layout");
  return r;
};
const ws = async () => (await requireChannel("email")).workspace.id;

export async function createEmailCampaignAction(name: unknown): Promise<Result<{ id: string }>> {
  const w = await ws();
  const n = campaignNameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]!.message };
  return done(await createEmailCampaign(prisma, w, n.data));
}

export async function renameEmailCampaignAction(id: string, name: unknown): Promise<Result> {
  const w = await ws();
  const n = campaignNameSchema.safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0]!.message };
  return done(await renameEmailCampaign(prisma, w, String(id), n.data));
}

export async function saveEmailSequenceAction(id: string, steps: unknown): Promise<Result> {
  const w = await ws();
  const s = emailSequenceSchema.safeParse(steps);
  if (!s.success) return { ok: false, error: s.error.issues[0]!.message };
  return done(await saveEmailSequence(prisma, w, String(id), s.data));
}

export async function setCampaignMailboxesAction(id: string, mailboxIds: unknown): Promise<Result> {
  const w = await ws();
  const ids = z.array(z.string().max(40)).max(100).safeParse(mailboxIds);
  if (!ids.success) return { ok: false, error: "Choose mailboxes from the list." };
  return done(await setCampaignMailboxes(prisma, w, String(id), ids.data));
}

export async function importEmailLeadsAction(id: string, text: unknown): Promise<Result<LeadImportResult>> {
  const w = await ws();
  const t = z.string().min(1, "Paste or upload a CSV.").max(5_000_000, "That file is too big (max 5 MB).").safeParse(text);
  if (!t.success) return { ok: false, error: t.error.issues[0]!.message };
  return done(await importEmailLeads(prisma, w, String(id), t.data));
}

export async function launchEmailCampaignAction(id: string): Promise<Result> {
  return done(await launchEmailCampaign(prisma, await ws(), String(id)));
}

export async function pauseEmailCampaignAction(id: string, paused: boolean): Promise<Result> {
  return done(await setEmailCampaignPaused(prisma, await ws(), String(id), paused === true));
}

export async function deleteEmailCampaignAction(id: string): Promise<Result> {
  return done(await deleteEmailCampaign(prisma, await ws(), String(id)));
}
