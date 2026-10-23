import type { Action, CampaignLead, Prisma, PrismaClient } from "@invytra/db";
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  applyResult,
  campaignSettingsSchema,
  stepSchema,
  type ActionResult,
  type CampaignSettings,
  type CampaignStep,
  type LeadState,
} from "@invytra/shared";
import { z } from "zod";

/** A campaign's steps and settings, read defensively (bad JSON → no steps, the campaign does nothing). */
export function campaignPlan(c: { steps: unknown; settings: unknown }): { steps: CampaignStep[]; settings: CampaignSettings } {
  return {
    steps: z.array(stepSchema).safeParse(c.steps).data ?? [],
    settings: campaignSettingsSchema.safeParse(c.settings ?? {}).data ?? DEFAULT_CAMPAIGN_SETTINGS,
  };
}

const FINAL = ["SUCCEEDED", "SKIPPED", "FAILED"] as const;

function resultOf(a: Action): ActionResult | null {
  if (a.type === "INBOX_SYNC") return null;
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
    applied++;
  }
  return applied;
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
    ...(action.type === "MESSAGE" && action.status === "SUCCEEDED" && !lead.messagedAt && { messagedAt: action.executedAt ?? now }),
  };
  // A reply arrived while this action was running: the lead stays REPLIED.
  if (lead.state === "REPLIED") return common;
  const result = resultOf(action);
  if (!result) return common;
  const { steps, settings } = campaignPlan(lead.campaign);
  const u = applyResult(steps, settings, { state: lead.state as LeadState, step: lead.step, invitedAt: lead.invitedAt, connectedAt: lead.connectedAt }, result, now, random);
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
