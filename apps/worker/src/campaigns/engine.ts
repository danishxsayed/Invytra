import { Prisma, type Campaign, type CampaignLead, type PrismaClient } from "@invytra/db";
import { hasInvite, missingVariables, nameKey, plannedAction, type CampaignStep, type LeadState } from "@invytra/shared";
import type { Queue } from "bullmq";
import { createActionRow, scheduleAction, type ActionJob } from "../queue/queue.js";
import { applyFinishedActions, campaignPlan } from "./results.js";

/**
 * The campaign engine. Every minute it:
 *  1. feeds finished actions back into their leads,
 *  2. cancels queued actions of paused campaigns,
 *  3. for each running campaign: copies in new list leads, stops leads who
 *     replied, and queues the next step for leads that are due.
 * It only ever QUEUES actions — the normal queue still applies limits,
 * working hours and human pacing (CLAUDE.md rules 1 and 4).
 */
export interface EngineDeps {
  prisma: PrismaClient;
  queue: Queue<ActionJob>;
  now?: () => Date;
  random?: () => number;
  /** Most campaign actions of one type waiting in an account's queue at once. */
  maxPendingPerType?: number;
}

export interface TickSummary {
  applied: number;
  queued: number;
  replied: number;
  cancelled: number;
}

export async function campaignTick(deps: EngineDeps): Promise<TickSummary> {
  const now = deps.now?.() ?? new Date();
  const summary: TickSummary = { applied: 0, queued: 0, replied: 0, cancelled: 0 };
  summary.cancelled = await cancelStopped(deps.prisma);
  summary.applied = await applyFinishedActions(deps.prisma, now, deps.random);
  const running = await deps.prisma.campaign.findMany({ where: { status: "ACTIVE", accountId: { not: null } } });
  for (const c of running) {
    await syncLeads(deps.prisma, c);
    summary.replied += await stopRepliedLeads(deps.prisma, c, now);
    summary.queued += await queueDueLeads(deps, c, now);
  }
  return summary;
}

/** Queued (not yet running) actions of paused campaigns are cancelled; their leads resume where they were. */
async function cancelStopped(prisma: PrismaClient): Promise<number> {
  const r = await prisma.action.updateMany({
    where: { status: "QUEUED", campaignLead: { campaign: { status: { not: "ACTIVE" } } } },
    data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() },
  });
  return r.count;
}

/** Copies leads from the campaign's list (again whenever the list changed). */
export async function syncLeads(prisma: PrismaClient, c: Campaign): Promise<void> {
  if (!c.listId) return;
  const list = await prisma.leadList.findFirst({ where: { id: c.listId, workspaceId: c.workspaceId }, select: { updatedAt: true } });
  if (!list || (c.leadsSyncedAt && c.leadsSyncedAt >= list.updatedAt)) return;
  const syncedAt = new Date();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO campaign_leads (id, campaign_id, workspace_id, lead_id, profile_url, first_name, last_name, company, title, state, step, created_at, updated_at)
    SELECT gen_random_uuid()::text, ${c.id}, ${c.workspaceId}, l.id, l.profile_url, l.first_name, l.last_name, l.company, l.title,
           'QUEUED', 0, now(), now()
    FROM leads l
    WHERE l.list_id = ${c.listId} AND l.workspace_id = ${c.workspaceId}
    ON CONFLICT (campaign_id, profile_url) DO NOTHING`);
  await prisma.campaign.update({ where: { id: c.id }, data: { leadsSyncedAt: syncedAt } });
}

/**
 * Stop on reply: an inbox message from the lead (matched by name — LinkedIn's
 * inbox list has no profile links) that arrived after we first contacted them.
 */
async function stopRepliedLeads(prisma: PrismaClient, c: Campaign, now: Date): Promise<number> {
  const contacted = await prisma.campaignLead.findMany({
    where: {
      campaignId: c.id,
      state: { in: ["IN_PROGRESS", "WAITING_ACCEPT", "DONE"] },
      OR: [{ invitedAt: { not: null } }, { messagedAt: { not: null } }],
    },
    select: { id: true, linkedinName: true, firstName: true, lastName: true, invitedAt: true, messagedAt: true, actionId: true },
  });
  if (contacted.length === 0) return 0;
  const since = new Date(now.getTime() - 90 * 86400_000);
  const inbox = await prisma.inboxMessage.findMany({
    where: { accountId: c.accountId!, fetchedAt: { gte: since } },
    select: { fromName: true, fetchedAt: true },
    orderBy: { fetchedAt: "desc" },
    take: 5000,
  });
  const latest = new Map<string, Date>();
  for (const m of inbox) {
    const k = nameKey(m.fromName);
    if (k && !latest.has(k)) latest.set(k, m.fetchedAt);
  }
  let replied = 0;
  for (const l of contacted) {
    const key = nameKey(l.linkedinName || [l.firstName, l.lastName].filter(Boolean).join(" "));
    const at = key ? latest.get(key) : undefined;
    const firstContact = [l.invitedAt, l.messagedAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0]!;
    if (!at || at < firstContact) continue;
    await prisma.$transaction([
      prisma.campaignLead.update({ where: { id: l.id }, data: { state: "REPLIED", repliedAt: at, nextAt: null } }),
      // Cancel anything still waiting in the queue for them (a running action finishes; the lead stays REPLIED).
      prisma.action.updateMany({ where: { campaignLeadId: l.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "REPLIED", executedAt: now } }),
    ]);
    replied++;
  }
  return replied;
}

type Planned = NonNullable<ReturnType<typeof plannedAction>>;

/** Queues the next step for due leads, keeping only a few of each kind waiting per account. */
async function queueDueLeads(deps: EngineDeps, c: Campaign, now: Date): Promise<number> {
  const { prisma } = deps;
  const { steps } = campaignPlan(c);
  if (steps.length === 0) return 0;
  const cap = deps.maxPendingPerType ?? 2;
  const pendingRows = await prisma.action.groupBy({
    by: ["type"],
    where: { accountId: c.accountId!, campaignLeadId: { not: null }, status: { in: ["QUEUED", "RUNNING"] } },
    _count: { _all: true },
  });
  const pending = new Map<string, number>(pendingRows.map((r) => [r.type, r._count._all]));
  const full = () => ["PROFILE_VISIT", "CONNECTION_REQUEST", "MESSAGE", "CHECK_CONNECTION"].every((t) => (pending.get(t) ?? 0) >= cap);

  const due = await prisma.campaignLead.findMany({
    where: {
      campaignId: c.id,
      state: { in: ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"] },
      actionId: null,
      OR: [{ nextAt: null }, { nextAt: { lte: now } }],
    },
    orderBy: [{ nextAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 100,
  });

  let queued = 0;
  for (const lead of due) {
    if (full() && lead.state !== "QUEUED") continue;
    const plan = plannedAction(steps, { state: lead.state as LeadState, step: lead.step, invitedAt: lead.invitedAt, connectedAt: lead.connectedAt });
    if (!plan) {
      await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "DONE", nextAt: null } });
      continue;
    }
    if (lead.state === "QUEUED") {
      // Decided up front (even when the queue is full), so skipped leads show as skipped right away.
      const skip = await skipReason(prisma, c, lead, steps);
      if (skip) {
        await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "SKIPPED", reason: skip, nextAt: null } });
        continue;
      }
    }
    if ((pending.get(plan.type) ?? 0) >= cap) continue;
    if (await enqueueStep(deps, c, lead, plan, now)) {
      pending.set(plan.type, (pending.get(plan.type) ?? 0) + 1);
      queued++;
    }
  }
  return queued;
}

/** Why a lead should not be contacted at all, or null. */
async function skipReason(prisma: PrismaClient, c: Campaign, lead: CampaignLead, steps: CampaignStep[]): Promise<string | null> {
  const inOther = await prisma.campaignLead.findFirst({
    where: {
      workspaceId: c.workspaceId,
      profileUrl: lead.profileUrl,
      campaignId: { not: c.id },
      state: { notIn: ["SKIPPED"] },
      createdAt: { lte: lead.createdAt },
    },
    select: { id: true },
  });
  if (inOther) return "IN_OTHER_CAMPAIGN";
  // Invite campaigns skip anyone already invited or messaged; message-only campaigns skip anyone already messaged.
  const types = hasInvite(steps) ? (["CONNECTION_REQUEST", "MESSAGE"] as const) : (["MESSAGE"] as const);
  const contacted = await prisma.action.findFirst({
    where: { targetUrl: lead.profileUrl, status: "SUCCEEDED", type: { in: [...types] }, account: { workspaceId: c.workspaceId } },
    select: { id: true },
  });
  if (contacted) return "ALREADY_CONTACTED";
  const vars = { company: lead.company, title: lead.title };
  for (const s of steps) {
    const text = s.type === "MESSAGE" ? s.text : s.type === "INVITE" ? s.note : "";
    const missing = missingVariables(text, vars);
    if (missing.length) return `MISSING_DETAIL:${missing[0]}`;
  }
  return null;
}

async function enqueueStep(deps: EngineDeps, c: Campaign, lead: CampaignLead, plan: Planned, now: Date): Promise<boolean> {
  const { prisma, queue } = deps;
  const vars = { firstName: lead.firstName, lastName: lead.lastName, company: lead.company, title: lead.title };
  const payload: Record<string, unknown> = { campaignId: c.id, vars };
  if (plan.type === "CONNECTION_REQUEST" && plan.note) payload.note = plan.note;
  if (plan.type === "MESSAGE") payload.text = plan.text;
  try {
    const action = await prisma.$transaction(async (tx) => {
      // Claim the lead first, so two engines can never queue the same step twice.
      const claimed = await tx.campaignLead.updateMany({ where: { id: lead.id, actionId: null }, data: { actionId: "pending" } });
      if (claimed.count === 0) return null;
      const row = await createActionRow(tx, { accountId: c.accountId!, type: plan.type, targetUrl: lead.profileUrl, payload, runAt: now, campaignLeadId: lead.id });
      await tx.campaignLead.update({
        where: { id: lead.id },
        data: { actionId: row.id, ...(lead.state === "QUEUED" && { state: "IN_PROGRESS" }) },
      });
      return row;
    });
    if (!action) return false;
    await scheduleAction(queue, action.id, action.scheduledAt);
    return true;
  } catch (e) {
    // Text that can't be sent (e.g. a placeholder) — fail the lead, never the whole campaign.
    await prisma.campaignLead.update({
      where: { id: lead.id },
      data: { state: "FAILED", reason: (e instanceof Error ? e.message : String(e)).slice(0, 300), nextAt: null, actionId: null },
    });
    return false;
  }
}
