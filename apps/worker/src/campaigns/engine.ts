import { Prisma, type Campaign, type CampaignLead, type PrismaClient } from "@invytra/db";
import { loadDnc } from "./do-not-contact.js";
import {
  DNC_REASON,
  REPLIED_ELSEWHERE,
  audienceIsFiltered,
  audienceSkip,
  campaignSettingsSchema,
  hasInvite,
  missingVariables,
  waitingToStart,
  waitingForAccountStart,
  workingHoursSchema,
  nameKey,
  plannedAction,
  type CampaignSettings,
  type CampaignStep,
  type LeadState,
} from "@invytra/shared";
import type { Queue } from "bullmq";
import { createActionRow, scheduleAction, type ActionJob } from "../queue/queue.js";
import { applyFinishedActions, campaignPlan } from "./results.js";

/**
 * The campaign engine. Every minute it:
 *  1. feeds finished actions back into their leads,
 *  2. cancels queued actions of paused campaigns and removed senders,
 *  3. for each running campaign: copies in new list leads, stops leads who
 *     replied, and queues the next step for leads that are due — sharing new
 *     leads out between the campaign's senders.
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
  const running = await deps.prisma.campaign.findMany({ where: { status: "ACTIVE", senders: { some: {} } } });
  for (const c of running) {
    // Launched with a start date that hasn't come yet: nothing happens until then.
    if (waitingToStart(campaignSettingsSchema.safeParse(c.settings ?? {}).data ?? { startAt: null }, now)) continue;
    await syncLeads(deps.prisma, c);
    summary.replied += await stopRepliedLeads(deps.prisma, c, now);
    summary.queued += await queueDueLeads(deps, c, now);
  }
  return summary;
}

/**
 * Queued (not yet running) actions are cancelled when their campaign is paused,
 * or when their sender was taken off the campaign. Their leads resume where
 * they were (or move to another sender).
 */
async function cancelStopped(prisma: PrismaClient): Promise<number> {
  const paused = await prisma.action.updateMany({
    where: { status: "QUEUED", campaignLead: { campaign: { status: { not: "ACTIVE" } } } },
    data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() },
  });
  const removed = await prisma.$executeRaw(Prisma.sql`
    UPDATE actions a SET status = 'SKIPPED', error = 'CANCELLED', executed_at = now()
    FROM campaign_leads cl
    WHERE a.campaign_lead_id = cl.id AND a.status = 'QUEUED'
      AND NOT EXISTS (SELECT 1 FROM campaign_senders s WHERE s.campaign_id = cl.campaign_id AND s.account_id = a.account_id)`);
  return paused.count + removed;
}

/** Copies leads from the campaign's list (again whenever the list changed). */
export async function syncLeads(prisma: PrismaClient, c: Campaign): Promise<void> {
  if (!c.listId) return;
  const list = await prisma.leadList.findFirst({ where: { id: c.listId, workspaceId: c.workspaceId }, select: { updatedAt: true } });
  if (!list || (c.leadsSyncedAt && c.leadsSyncedAt >= list.updatedAt)) return;
  const syncedAt = new Date();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO campaign_leads (id, campaign_id, workspace_id, lead_id, profile_url, first_name, last_name, company, title, degree, premium, state, step, created_at, updated_at)
    SELECT gen_random_uuid()::text, ${c.id}, ${c.workspaceId}, l.id, l.profile_url, l.first_name, l.last_name, l.company, l.title, l.degree, l.premium,
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
      accountId: { not: null },
      state: { in: ["IN_PROGRESS", "WAITING_ACCEPT", "DONE"] },
      OR: [{ invitedAt: { not: null } }, { messagedAt: { not: null } }],
    },
    select: { id: true, accountId: true, linkedinName: true, firstName: true, lastName: true, invitedAt: true, messagedAt: true },
  });
  if (contacted.length === 0) return 0;
  const since = new Date(now.getTime() - 90 * 86400_000);
  // Each lead talks to its own sender, so each sender's inbox is checked for its own leads.
  const latestByAccount = new Map<string, Map<string, Date>>();
  for (const accountId of new Set(contacted.map((l) => l.accountId!))) {
    const inbox = await prisma.inboxMessage.findMany({
      where: { accountId, fetchedAt: { gte: since } },
      select: { fromName: true, fetchedAt: true },
      orderBy: { fetchedAt: "desc" },
      take: 5000,
    });
    const latest = new Map<string, Date>();
    for (const m of inbox) {
      const k = nameKey(m.fromName);
      if (k && !latest.has(k)) latest.set(k, m.fetchedAt);
    }
    latestByAccount.set(accountId, latest);
  }
  let replied = 0;
  for (const l of contacted) {
    const key = nameKey(l.linkedinName || [l.firstName, l.lastName].filter(Boolean).join(" "));
    const at = key ? latestByAccount.get(l.accountId!)?.get(key) : undefined;
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

const TYPES = ["PROFILE_VISIT", "CONNECTION_REQUEST", "MESSAGE", "CHECK_CONNECTION", "LIKE_POST", "WITHDRAW_INVITE", "FOLLOW_PROFILE", "COMMENT_POST", "EVENT_INVITE"] as const;

/**
 * Queues the next step for due leads. New leads are shared out between the
 * campaign's connected senders (fewest leads first); a lead then stays with
 * its sender for its whole journey. Only a few actions of each kind wait in
 * any sender's queue at once.
 */
async function queueDueLeads(deps: EngineDeps, c: Campaign, now: Date): Promise<number> {
  const { prisma } = deps;
  const { steps, settings } = campaignPlan(c);
  if (steps.length === 0) return 0;
  const cap = deps.maxPendingPerType ?? 2;

  const senders = await prisma.campaignSender.findMany({
    where: { campaignId: c.id },
    select: { accountId: true, account: { select: { status: true, workingHours: true } } },
    orderBy: { createdAt: "asc" },
  });
  const senderIds = new Set(senders.map((s) => s.accountId));
  // Connected, and not waiting for its start date (Accounts → Settings).
  const ready = senders
    .filter((s) => s.account.status === "ACTIVE" && !waitingForAccountStart(workingHoursSchema.safeParse(s.account.workingHours).data ?? {}, now))
    .map((s) => s.accountId);

  // How many campaign actions of each kind already wait in each sender's queue (all campaigns).
  const pendingRows = await prisma.action.groupBy({
    by: ["accountId", "type"],
    where: { accountId: { in: [...senderIds] }, campaignLeadId: { not: null }, status: { in: ["QUEUED", "RUNNING"] } },
    _count: { _all: true },
  });
  const pending = new Map<string, number>(pendingRows.map((r) => [`${r.accountId}:${r.type}`, r._count._all]));
  const pendingOf = (accountId: string, type: string) => pending.get(`${accountId}:${type}`) ?? 0;
  const hasRoom = (accountId: string, type: string) => pendingOf(accountId, type) < cap;
  const allFull = () => ready.every((a) => TYPES.every((t) => !hasRoom(a, t)));

  // Leads per sender in this campaign, to share new ones out evenly.
  const loadRows = await prisma.campaignLead.groupBy({ by: ["accountId"], where: { campaignId: c.id, accountId: { not: null } }, _count: { _all: true } });
  const load = new Map<string, number>(loadRows.map((r) => [r.accountId!, r._count._all]));

  // The workspace's do-not-contact list: checked before every step, so a person added later stops too.
  const blocked = await loadDnc(prisma, c.workspaceId);

  const due = await prisma.campaignLead.findMany({
    where: {
      campaignId: c.id,
      state: { in: ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"] },
      actionId: null,
      OR: [{ nextAt: null }, { nextAt: { lte: now } }],
    },
    orderBy: [{ nextAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 200,
    include: { lead: { select: { email: true, personId: true } } },
  });
  // Same person, other channel: anyone who replied to an email campaign isn't also contacted here.
  const people = [...new Set(due.map((l) => l.lead?.personId).filter((x): x is string => !!x))];
  const repliedByEmail = people.length
    ? new Set(
        (await prisma.emailLead.findMany({ where: { workspaceId: c.workspaceId, status: "REPLIED", contact: { personId: { in: people } } }, select: { contact: { select: { personId: true } } } })).map((r) => r.contact!.personId!),
      )
    : new Set<string>();

  let queued = 0;
  for (const lead of due) {
    if (blocked({ profileUrl: lead.profileUrl, company: lead.company, email: lead.lead?.email })) {
      await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "SKIPPED", reason: DNC_REASON, nextAt: null } });
      continue;
    }
    if (lead.lead?.personId && repliedByEmail.has(lead.lead.personId)) {
      await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "SKIPPED", reason: REPLIED_ELSEWHERE, nextAt: null } });
      continue;
    }
    if (allFull() && lead.state !== "QUEUED") continue;
    const started = !!(lead.invitedAt || lead.messagedAt || lead.connectedAt);
    let accountId = lead.accountId;

    // Its sender was taken off the campaign (or deleted): someone not yet contacted moves to another
    // sender; someone already contacted can't — the connection belongs to the old account.
    if ((accountId && !senderIds.has(accountId)) || (!accountId && lead.state !== "QUEUED")) {
      if (started) {
        await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "SKIPPED", reason: "SENDER_REMOVED", nextAt: null } });
        continue;
      }
      accountId = null;
    }

    const plan = plannedAction(steps, { state: lead.state as LeadState, step: lead.step, invitedAt: lead.invitedAt, connectedAt: lead.connectedAt, reason: lead.reason });
    if (!plan) {
      await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "DONE", nextAt: null } });
      continue;
    }
    if (lead.state === "QUEUED") {
      // Decided up front (even when queues are full), so skipped leads show as skipped right away.
      const skip = await skipReason(prisma, c, lead, steps, settings);
      if (skip) {
        await prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "SKIPPED", reason: skip, nextAt: null } });
        continue;
      }
    }

    if (!accountId) {
      // Share out: the connected sender with the fewest leads that has room for this kind of step.
      const pick = ready.filter((a) => hasRoom(a, plan.type)).sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
      if (!pick) continue;
      accountId = pick;
    } else if (!ready.includes(accountId) || !hasRoom(accountId, plan.type)) {
      continue; // its sender is paused, disconnected or busy — the lead waits for it
    }

    // Not contacted yet and we don't know yet if they fit the audience: the action checks their profile first.
    const audience = audienceIsFiltered(settings) && !started ? { degrees: settings.degrees, premiumOnly: settings.premiumOnly } : undefined;
    if (await enqueueStep(deps, c, lead, accountId, plan, now, audience)) {
      pending.set(`${accountId}:${plan.type}`, pendingOf(accountId, plan.type) + 1);
      if (lead.accountId !== accountId) load.set(accountId, (load.get(accountId) ?? 0) + 1);
      queued++;
    }
  }
  return queued;
}

/** Why a lead should not be contacted at all, or null. */
async function skipReason(prisma: PrismaClient, c: Campaign, lead: CampaignLead, steps: CampaignStep[], settings: CampaignSettings): Promise<string | null> {
  // Known from a search import (or an earlier visit) to be outside who this campaign is for.
  const outside = audienceSkip(settings, { degree: lead.degree, premium: lead.premium });
  if (outside) return outside;
  const inOther = settings.skipOtherCampaigns && await prisma.campaignLead.findFirst({
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
    const text = s.type === "MESSAGE" || s.type === "COMMENT" ? s.text : s.type === "INVITE" ? s.note : "";
    const missing = missingVariables(text, vars);
    if (missing.length) return `MISSING_DETAIL:${missing[0]}`;
  }
  return null;
}

async function enqueueStep(
  deps: EngineDeps,
  c: Campaign,
  lead: CampaignLead,
  accountId: string,
  plan: Planned,
  now: Date,
  audience?: Pick<CampaignSettings, "degrees" | "premiumOnly">,
): Promise<boolean> {
  const { prisma, queue } = deps;
  const vars = { firstName: lead.firstName, lastName: lead.lastName, company: lead.company, title: lead.title };
  const payload: Record<string, unknown> = { campaignId: c.id, vars, ...(audience && { audience }) };
  if (plan.type === "CONNECTION_REQUEST" && plan.note) payload.note = plan.note;
  if (plan.type === "MESSAGE" || plan.type === "COMMENT_POST") payload.text = plan.text;
  // "AI writes this for each person": the text above is the AI's guide (1 AI credit per person).
  if ((plan.type === "CONNECTION_REQUEST" || plan.type === "MESSAGE") && plan.aiWrite) payload.aiWrite = true;
  // A handwritten card drawn for this person and sent with the message (2 AI credits).
  if (plan.type === "MESSAGE" && plan.card) payload.card = plan.card;
  // A voice note in the customer's own voice (5 AI credits).
  if (plan.type === "MESSAGE" && plan.voice) payload.voice = plan.voice;
  // A video note: their recording, the greeting personalized and lip-synced (15 AI credits).
  if (plan.type === "MESSAGE" && plan.video) payload.video = plan.video;
  // {aiLine}: written when it goes out (accounts through Unipile); the fallback line otherwise.
  const ai = campaignSettingsSchema.safeParse(c.settings).data?.ai;
  if (ai?.fallback && [payload.note, payload.text].some((t) => typeof t === "string" && t.includes("{aiLine}"))) payload.aiFallback = ai.fallback;
  if (plan.type === "EVENT_INVITE") {
    payload.eventUrl = plan.eventUrl;
    // The invite dialog searches your connections by name: LinkedIn's spelling first.
    payload.name = lead.linkedinName ?? [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  }
  try {
    const action = await prisma.$transaction(async (tx) => {
      // Claim the lead first, so two engines can never queue the same step twice.
      const claimed = await tx.campaignLead.updateMany({ where: { id: lead.id, actionId: null }, data: { actionId: "pending" } });
      if (claimed.count === 0) return null;
      const row = await createActionRow(tx, { accountId, type: plan.type, targetUrl: lead.profileUrl, payload, runAt: now, campaignLeadId: lead.id });
      await tx.campaignLead.update({
        where: { id: lead.id },
        data: { actionId: row.id, accountId, ...(lead.state === "QUEUED" && { state: "IN_PROGRESS" }) },
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
