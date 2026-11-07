"use server";

import { prisma } from "@invytra/db";
import { emailAiRequestSchema, emailSequenceSchema, type EmailDraft } from "@invytra/shared";
import { OpenAiError } from "@invytra/db";
import { aiEmailFromEnv } from "@/lib/ai-email";
import { chargeAi, getAiBalance, refundAi } from "@/lib/ai-credits";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Result } from "@/lib/accounts";
import { requireChannel } from "@/lib/auth";
import {
  campaignNameSchema,
  createEmailCampaign,
  deleteEmailCampaign,
  addListsToCampaign,
  launchEmailCampaign,
  launchPlanSchema,
  cancelEmailCampaign,
  renameEmailCampaign,
  saveEmailSequence,
  setCampaignMailboxes,
  setEmailCampaignPaused,
  saveEmailCampaignSettings,
  emailCampaignSettingsSchema,
  type AddContactsResult,
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

export async function addListsToCampaignAction(id: string, listIds: unknown): Promise<Result<AddContactsResult>> {
  const w = await ws();
  const p = z.array(z.string().max(40)).min(1, "Choose a list.").max(50).safeParse(listIds);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await addListsToCampaign(prisma, w, String(id), p.data));
}

export async function launchEmailCampaignAction(id: string, plan: unknown = { when: "now" }): Promise<Result> {
  const w = await ws();
  const p = launchPlanSchema.safeParse(plan);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await launchEmailCampaign(prisma, w, String(id), p.data));
}

export async function cancelEmailCampaignAction(id: string): Promise<Result> {
  return done(await cancelEmailCampaign(prisma, await ws(), String(id)));
}

export async function pauseEmailCampaignAction(id: string, paused: boolean): Promise<Result> {
  return done(await setEmailCampaignPaused(prisma, await ws(), String(id), paused === true));
}

export async function deleteEmailCampaignAction(id: string): Promise<Result> {
  return done(await deleteEmailCampaign(prisma, await ws(), String(id)));
}

export async function saveEmailCampaignSettingsAction(id: string, input: unknown): Promise<Result> {
  const w = await ws();
  const p = emailCampaignSettingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  return done(await saveEmailCampaignSettings(prisma, w, String(id), p.data));
}

/** Drafts from the AI writer. It only drafts: nothing is saved or sent from here. */
/** AI writer: 1 AI credit per request (given back if it fails). Returns the drafts and the credits left. */
export async function aiEmailAction(input: unknown): Promise<Result<{ drafts: EmailDraft[]; creditsLeft: number }>> {
  const w = await ws();
  const p = emailAiRequestSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  const writer = aiEmailFromEnv();
  if (!writer) return { ok: false, error: "AI writing isn't set up: add OPENAI_API_KEY to .env and restart." };
  const charge = await chargeAi(prisma, w, "TEXT");
  if (!charge.ok) return charge;
  const fail = async (error: string): Promise<Result<never>> => (await refundAi(prisma, w, charge.value), { ok: false, error });
  try {
    const drafts = await writer.write(p.data);
    if (!drafts.length) return fail("The drafts didn't pass the checks (links, made-up variables or spammy words). Try again; no credit was used.");
    return { ok: true, value: { drafts, creditsLeft: (await getAiBalance(prisma, w)).left } };
  } catch (e) {
    if (e instanceof OpenAiError) return fail(e.status === 429 ? "The AI is busy right now. Try again in a minute." : e.status === 401 ? "The OpenAI key was refused. Check OPENAI_API_KEY." : "The AI couldn't write right now. Try again.");
    return fail("The AI took too long. Try again.");
  }
}

/** AI credits left, for showing next to AI buttons. */
export async function aiCreditsLeftAction(): Promise<number> {
  return (await getAiBalance(prisma, await ws())).left;
}
