import type { Action, CampaignLead, Prisma, PrismaClient } from "@invytra/db";
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  applyResult,
  campaignSettingsSchema,
  canonicalProfileUrl,
  isMemberIdUrl,
  stepSchema,
  type ActionResult,
  type CampaignSettings,
  type CampaignStep,
  type LeadState,
} from "@invytra/shared";
import { z } from "zod";
import { saveLeadEmail } from "./lead-email.js";

/** A campaign's steps and settings, read defensively (bad JSON → no steps, the campaign does nothing). */
export function campaignPlan(c: { steps: unknown; settings: unknown }): { steps: CampaignStep[]; settings: CampaignSettings } {
  return {
    steps: z.array(stepSchema).safeParse(c.steps).data ?? [],
    settings: campaignSettingsSchema.safeParse(c.settings ?? {}).data ?? DEFAULT_CAMPAIGN_SETTINGS,
  };
}

const FINAL = ["SUCCEEDED", "SKIPPED", "FAILED"] as const;

function resultOf(a: Action): ActionResult | null {
  if (a.type === "INBOX_SYNC" || a.type === "SEARCH_PAGE" || a.type === "REPLY") return null;
  const r = ((a.payload ?? {}) as { result?: { status?: string } }).result;
  const connection = r?.status as ActionResult["connection"] | undefined;
  return { type: a.type, status: a.status as ActionResult["status"], error: a.error, connection };
}

/**
 * Feeds finished actions back into their campaign leads. Safe to run any
 * number of times: a lead is only updated while its actionId still points
 * at the finished action.
 */
export async function applyFinishedActions(prisma: PrismaClient, now: Date, random: () => number = Math.random): Promise<number> {
  const waiting = await prisma.campaignLead.findMany({
    where: { actionId: { not: null } },
    take: 500,
    include: { campaign: { select: { steps: true, settings: true } } },
  });
  if (waiting.length === 0) return 0;
  const actions = await prisma.action.findMany({ where: { id: { in: waiting.map((l) => l.actionId!) }, status: { in: [...FINAL] } } });
  const byId = new Map(actions.map((a) => [a.id, a]));
  let applied = 0;
  for (const lead of waiting) {
    const action = byId.get(lead.actionId!);
    if (!action) {
      // The action row is gone (deleted by hand): release the lead so it runs again.
      if (!(await prisma.action.findUnique({ where: { id: lead.actionId! }, select: { id: true } }))) {
        await release(prisma, lead, { actionId: null, nextAt: now });
      }
      continue;
    }
    await release(prisma, lead, updateFor(lead, action, now, random));
    await recordFactsOnList(prisma, lead, action);
    await resolveProfileUrl(prisma, lead, action);
    applied++;
  }
  return applied;
}

/**
 * Sales Navigator gives member-id links (/in/ACwAA…/). The first time we open
 * one, LinkedIn redirects to the person's real profile; from then on the lead
 * (in the campaign and in its list) uses that link, so "already contacted"
 * checks and later imports recognise them.
 */
async function resolveProfileUrl(prisma: PrismaClient, lead: CampaignLead, action: Action): Promise<void> {
  if (!isMemberIdUrl(lead.profileUrl)) return;
  const seen = ((action.payload ?? {}) as { result?: { url?: unknown } }).result?.url;
  let real: string | null = null;
  try {
    // Only the path matters (the worker may run against a test site in development).
    if (typeof seen === "string") real = canonicalProfileUrl(`https://www.linkedin.com${new URL(seen).pathname}`);
  } catch {
    /* not a URL */
  }
  if (!real || real === lead.profileUrl || isMemberIdUrl(real)) return;
  try {
    await prisma.campaignLead.update({ where: { id: lead.id }, data: { profileUrl: real } });
    if (lead.leadId) await prisma.lead.update({ where: { id: lead.leadId }, data: { profileUrl: real } });
  } catch {
    // The same person is already in this campaign or list under their real link — keep both as they are.
  }
}

/** Connection degree / Premium badge the action saw on the profile, if any. */
function factsOf(action: Action): { degree?: number; premium?: boolean } {
  const r = ((action.payload ?? {}) as { result?: { degree?: unknown; premium?: unknown } }).result ?? {};
  return {
    ...(r.degree === 1 || r.degree === 2 || r.degree === 3 ? { degree: r.degree } : {}),
    ...(typeof r.premium === "boolean" ? { premium: r.premium } : {}),
  };
}

/** Their profile photo link, when the action saw one (a fresh one each time: LinkedIn's links expire). */
function photoOf(action: Action): { photoUrl?: string } {
  const u = ((action.payload ?? {}) as { result?: { photoUrl?: unknown } }).result?.photoUrl;
  return typeof u === "string" && /^https:\/\//.test(u) && u.length <= 1500 ? { photoUrl: u } : {};
}

/** The lead list keeps what we learned too (shown on the list, used by later campaigns). */
async function recordFactsOnList(prisma: PrismaClient, lead: CampaignLead, action: Action): Promise<void> {
  if (!lead.leadId) return;
  const facts = { ...factsOf(action), ...photoOf(action) };
  if (Object.keys(facts).length) await prisma.lead.updateMany({ where: { id: lead.leadId }, data: facts });
  const email = ((action.payload ?? {}) as { result?: { email?: unknown } }).result?.email;
  if (typeof email === "string" && email.includes("@")) {
    try {
      await saveLeadEmail(prisma, lead.leadId, email);
    } catch {
      // A missing list or a race with another save: the email comes again on the next check.
    }
  }
}

/** Only clears/updates the lead if it still waits on this same action. */
async function release(prisma: PrismaClient, lead: CampaignLead, data: Prisma.CampaignLeadUpdateManyMutationInput) {
  await prisma.campaignLead.updateMany({ where: { id: lead.id, actionId: lead.actionId }, data: { ...data, actionId: null } });
}

function updateFor(
  lead: CampaignLead & { campaign: { steps: unknown; settings: unknown } },
  action: Action,
  now: Date,
  random: () => number,
): Prisma.CampaignLeadUpdateManyMutationInput {
  const name = ((action.payload ?? {}) as { result?: { name?: unknown } }).result?.name;
  const common: Prisma.CampaignLeadUpdateManyMutationInput = {
    lastActionAt: action.executedAt ?? now,
    ...(typeof name === "string" && name.trim() && { linkedinName: name.trim() }),
    ...factsOf(action),
    ...(action.type === "MESSAGE" && action.status === "SUCCEEDED" && !lead.messagedAt && { messagedAt: action.executedAt ?? now }),
  };
  // A reply arrived while this action was running: the lead stays REPLIED.
  if (lead.state === "REPLIED") return common;
  const result = resultOf(action);
  if (!result) return common;
  const { steps, settings } = campaignPlan(lead.campaign);
  // Paused by you while this step was already running: record what happened, stay paused.
  // The state to resume to is kept in reason ("PAUSED:<state>").
  if (lead.state === "PAUSED") {
    const resumeTo = (lead.reason ?? "").split(":")[1] || "IN_PROGRESS";
    const u = applyResult(steps, settings, { state: resumeTo as LeadState, step: lead.step, invitedAt: lead.invitedAt, connectedAt: lead.connectedAt }, result, now, random);
    return {
      ...common,
      step: u.step,
      nextAt: null,
      reason: `PAUSED:${u.state}`,
      ...(u.invitedAt && { invitedAt: u.invitedAt }),
      ...(u.connectedAt && { connectedAt: u.connectedAt }),
    };
  }
  const u = applyResult(
    steps,
    settings,
    { state: lead.state as LeadState, step: lead.step, invitedAt: lead.invitedAt, connectedAt: lead.connectedAt, reason: lead.reason },
    result,
    now,
    random,
  );
  return {
    ...common,
    state: u.state,
    step: u.step,
    nextAt: u.nextAt,
    ...(u.invitedAt && { invitedAt: u.invitedAt }),
    ...(u.connectedAt && { connectedAt: u.connectedAt }),
    ...(u.reason !== undefined && { reason: u.reason }),
  };
}
