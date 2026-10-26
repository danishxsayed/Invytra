import type { Prisma, PrismaClient } from "@invytra/db";
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  campaignSettingsSchema,
  sequenceProblems,
  stepSchema,
  waitingToStart,
  type CampaignSettings,
  type CampaignStep,
} from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Campaigns. Every function takes the signed-in user's workspaceId first; ids
 * of accounts, lists and campaigns from the browser are checked against it.
 */

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign not found.");
  }
}

export const MAX_SENDERS = 50;

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name.").max(80, "Keep the name under 80 characters."),
  /** The LinkedIn accounts that send; leads are shared out between them. */
  accountIds: z.array(z.string().max(40)).max(MAX_SENDERS, `Use at most ${MAX_SENDERS} senders in one campaign.`).default([]),
  listId: z.string().max(40).nullable(),
  steps: z.array(stepSchema).max(10, "Use at most 10 steps."),
  settings: campaignSettingsSchema,
});
export type CampaignInput = z.input<typeof campaignInputSchema>;

const SENDERS = { orderBy: { createdAt: "asc" }, select: { account: { select: { id: true, label: true, status: true, timezone: true } } } } as const;

export function readSteps(raw: unknown): CampaignStep[] {
  return z.array(stepSchema).safeParse(raw).data ?? [];
}
export function readSettings(raw: unknown): CampaignSettings {
  return campaignSettingsSchema.safeParse(raw ?? {}).data ?? DEFAULT_CAMPAIGN_SETTINGS;
}

export async function getCampaign(prisma: PrismaClient, workspaceId: string, id: string) {
  const c = await prisma.campaign.findFirst({
    where: { id, workspaceId },
    include: { senders: SENDERS, list: { select: { id: true, name: true } } },
  });
  if (!c) throw new CampaignNotFoundError();
  const { senders, ...rest } = c;
  return { ...rest, senders: senders.map((s) => s.account), steps: readSteps(c.steps), settings: readSettings(c.settings) };
}
export type CampaignFull = Awaited<ReturnType<typeof getCampaign>>;

const senderIds = (input: CampaignInput) => [...new Set(input.accountIds ?? [])];

/** Accounts and list must belong to the same workspace. */
async function checkRefs(prisma: PrismaClient, workspaceId: string, input: CampaignInput): Promise<string | null> {
  const ids = senderIds(input);
  if (ids.length > MAX_SENDERS) return `Use at most ${MAX_SENDERS} senders in one campaign.`;
  if (ids.length && (await prisma.linkedinAccount.count({ where: { id: { in: ids }, workspaceId } })) !== ids.length) {
    return "Choose from your own LinkedIn accounts.";
  }
  if (input.listId && !(await prisma.leadList.findFirst({ where: { id: input.listId, workspaceId }, select: { id: true } }))) {
    return "Choose one of your lead lists.";
  }
  return null;
}

export async function createCampaign(prisma: PrismaClient, workspaceId: string, input: CampaignInput): Promise<Result<string>> {
  const bad = await checkRefs(prisma, workspaceId, input);
  if (bad) return { ok: false, error: bad };
  const c = await prisma.campaign.create({
    data: {
      workspaceId,
      name: input.name,
      listId: input.listId,
      steps: input.steps as Prisma.InputJsonValue,
      settings: input.settings as Prisma.InputJsonValue,
      senders: { create: senderIds(input).map((accountId) => ({ accountId })) },
    },
    select: { id: true },
  });
  return { ok: true, value: c.id };
}

/**
 * Drafts can change anything. Once launched, leads are part-way through the
 * steps, so existing steps keep their order and kind (texts and waits can
 * change, follow-ups can be added at the end) and the list stays. Senders can
 * be added or removed at any time: the worker shares new leads out to added
 * senders, and moves leads a removed sender hasn't contacted yet to the others.
 */
export async function updateCampaign(prisma: PrismaClient, workspaceId: string, id: string, input: CampaignInput): Promise<Result> {
  const current = await getCampaign(prisma, workspaceId, id);
  const bad = await checkRefs(prisma, workspaceId, input);
  if (bad) return { ok: false, error: bad };
  if (current.status !== "DRAFT") {
    const reordered = current.steps.some((s, i) => input.steps[i]?.type !== s.type);
    if (reordered) return { ok: false, error: "This campaign has started: steps can be edited or added at the end, but not removed or reordered." };
    if (senderIds(input).length === 0) return { ok: false, error: "Keep at least one LinkedIn account sending." };
    // Once it has really started, a new start date would silently pause it — keep the old one.
    if (!waitingToStart(current.settings, new Date())) input = { ...input, settings: { ...input.settings, startAt: current.settings.startAt } };
    if (current.listId && input.listId !== current.listId) return { ok: false, error: "The lead list can't change after launch." };
    const problems = sequenceProblems(input.steps);
    if (problems.length) return { ok: false, error: problems[0]! };
  }
  const ids = senderIds(input);
  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: current.id },
      data: {
        name: input.name,
        listId: input.listId,
        steps: input.steps as Prisma.InputJsonValue,
        settings: input.settings as Prisma.InputJsonValue,
      },
    }),
    prisma.campaignSender.deleteMany({ where: { campaignId: current.id, accountId: { notIn: ids } } }),
    prisma.campaignSender.createMany({ data: ids.map((accountId) => ({ campaignId: current.id, accountId })), skipDuplicates: true }),
  ]);
  return { ok: true, value: undefined };
}

/** What still stands in the way of launching (plain words; empty = ready). */
export async function launchProblems(prisma: PrismaClient, workspaceId: string, c: CampaignFull): Promise<string[]> {
  const out: string[] = [];
  if (c.senders.length === 0) out.push("Choose at least one LinkedIn account to send from.");
  else if (c.senders.every((a) => a.status === "DISCONNECTED")) {
    out.push(c.senders.length === 1 ? `Connect “${c.senders[0]!.label}” to LinkedIn first.` : "Connect at least one of the chosen accounts to LinkedIn first.");
  }
  if (!c.listId) out.push("Choose a lead list.");
  else if (
    (await prisma.lead.count({ where: { workspaceId, listId: c.listId } })) === 0 &&
    (await prisma.leadImport.count({ where: { workspaceId, listId: c.listId, status: "RUNNING" } })) === 0
  ) {
    out.push("The lead list is empty.");
  }
  out.push(...sequenceProblems(c.steps));
  return out;
}

export async function setCampaignStatus(
  prisma: PrismaClient,
  workspaceId: string,
  id: string,
  to: "ACTIVE" | "PAUSED",
): Promise<Result> {
  const c = await getCampaign(prisma, workspaceId, id);
  if (to === "ACTIVE") {
    const problems = await launchProblems(prisma, workspaceId, c);
    if (problems.length) return { ok: false, error: problems[0]! };
  } else if (c.status !== "ACTIVE") return { ok: false, error: "Only a running campaign can be paused." };
  // Pausing: the worker cancels queued steps within a minute; leads resume where they were.
  await prisma.campaign.update({ where: { id: c.id }, data: { status: to, ...(to === "ACTIVE" && !c.startedAt && { startedAt: new Date() }) } });
  return { ok: true, value: undefined };
}

export async function deleteCampaign(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const c = await getCampaign(prisma, workspaceId, id);
  await prisma.$transaction([
    // Nothing still waiting in the queue may run once the campaign is gone.
    prisma.action.updateMany({
      where: { status: "QUEUED", campaignLead: { campaignId: c.id } },
      data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() },
    }),
    prisma.campaign.delete({ where: { id: c.id } }),
  ]);
  return { ok: true, value: undefined };
}

// ---------------------------------------------------------------- stats

export interface CampaignStats {
  total: number;
  byState: Record<string, number>;
  invited: number;
  accepted: number;
  messaged: number;
  replied: number;
}

export async function campaignStats(prisma: PrismaClient, workspaceId: string, ids: string[]): Promise<Map<string, CampaignStats>> {
  const out = new Map<string, CampaignStats>();
  if (ids.length === 0) return out;
  const where = { workspaceId, campaignId: { in: ids } };
  const [states, invited, accepted, messaged, replied] = await Promise.all([
    prisma.campaignLead.groupBy({ by: ["campaignId", "state"], where, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["campaignId"], where: { ...where, invitedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["campaignId"], where: { ...where, connectedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["campaignId"], where: { ...where, messagedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["campaignId"], where: { ...where, repliedAt: { not: null } }, _count: { _all: true } }),
  ]);
  for (const id of ids) out.set(id, { total: 0, byState: {}, invited: 0, accepted: 0, messaged: 0, replied: 0 });
  for (const s of states) {
    const st = out.get(s.campaignId)!;
    st.byState[s.state] = s._count._all;
    st.total += s._count._all;
  }
  const put = (rows: { campaignId: string; _count: { _all: number } }[], k: "invited" | "accepted" | "messaged" | "replied") =>
    rows.forEach((r) => (out.get(r.campaignId)![k] = r._count._all));
  put(invited, "invited");
  put(accepted, "accepted");
  put(messaged, "messaged");
  put(replied, "replied");
  return out;
}

/** Per sender in one campaign: leads assigned, invited, accepted, messaged, replied. */
export async function senderStats(prisma: PrismaClient, workspaceId: string, campaignId: string) {
  const where = { workspaceId, campaignId, accountId: { not: null } };
  const [leads, invited, accepted, messaged, replied] = await Promise.all([
    prisma.campaignLead.groupBy({ by: ["accountId"], where, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["accountId"], where: { ...where, invitedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["accountId"], where: { ...where, connectedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["accountId"], where: { ...where, messagedAt: { not: null } }, _count: { _all: true } }),
    prisma.campaignLead.groupBy({ by: ["accountId"], where: { ...where, repliedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const out = new Map<string, { leads: number; invited: number; accepted: number; messaged: number; replied: number }>();
  const row = (id: string) => out.get(id) ?? out.set(id, { leads: 0, invited: 0, accepted: 0, messaged: 0, replied: 0 }).get(id)!;
  const put = (rows: { accountId: string | null; _count: { _all: number } }[], k: "leads" | "invited" | "accepted" | "messaged" | "replied") =>
    rows.forEach((r) => (row(r.accountId!)[k] = r._count._all));
  put(leads, "leads");
  put(invited, "invited");
  put(accepted, "accepted");
  put(messaged, "messaged");
  put(replied, "replied");
  return out;
}

export async function listCampaigns(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { senders: SENDERS, list: { select: { name: true } } },
  });
  const stats = await campaignStats(prisma, workspaceId, rows.map((r) => r.id));
  const listSizes = await prisma.lead.groupBy({
    by: ["listId"],
    where: { workspaceId, listId: { in: rows.map((r) => r.listId).filter((x): x is string => !!x) } },
    _count: { _all: true },
  });
  return rows.map(({ senders, ...r }) => ({
    ...r,
    senders: senders.map((s) => s.account),
    steps: readSteps(r.steps),
    settings: readSettings(r.settings),
    stats: stats.get(r.id)!,
    listSize: listSizes.find((l) => l.listId === r.listId)?._count._all ?? 0,
  }));
}

export async function launchedCampaignCount(prisma: PrismaClient, workspaceId: string): Promise<number> {
  return prisma.campaign.count({ where: { workspaceId, startedAt: { not: null } } });
}

export const LEAD_FILTERS = {
  all: [],
  active: ["QUEUED", "IN_PROGRESS", "PAUSED"],
  waiting: ["WAITING_ACCEPT"],
  replied: ["REPLIED"],
  done: ["DONE"],
  not_accepted: ["NOT_ACCEPTED"],
  skipped: ["SKIPPED", "FAILED"],
} as const;
export type LeadFilter = keyof typeof LEAD_FILTERS;

export async function campaignLeadsPage(
  prisma: PrismaClient,
  workspaceId: string,
  campaignId: string,
  { filter = "all", page = 1, pageSize = 50 }: { filter?: LeadFilter; page?: number; pageSize?: number } = {},
) {
  await getCampaign(prisma, workspaceId, campaignId);
  const states = LEAD_FILTERS[filter] as readonly string[];
  const where: Prisma.CampaignLeadWhereInput = {
    workspaceId,
    campaignId,
    ...(states.length && { state: { in: [...states] as Prisma.EnumCampaignLeadStateFilter["in"] } }),
  };
  const [total, rows] = await Promise.all([
    prisma.campaignLead.count({ where }),
    prisma.campaignLead.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: { account: { select: { label: true } } },
    }),
  ]);
  return { total, rows };
}

/** Accounts and lists to choose from in the builder, plus a few leads per list for the preview. */
export async function builderOptions(prisma: PrismaClient, workspaceId: string) {
  const [accounts, lists] = await Promise.all([
    prisma.linkedinAccount.findMany({
      where: { workspaceId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, status: true, profileName: true, limits: true },
    }),
    prisma.leadList.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, _count: { select: { leads: true } }, imports: { where: { status: "RUNNING" }, select: { maxLeads: true, found: true } } },
    }),
  ]);
  const samples = await Promise.all(
    lists.map((l) =>
      prisma.lead.findMany({
        where: { workspaceId, listId: l.id },
        orderBy: { createdAt: "asc" },
        take: 5,
        select: { id: true, firstName: true, lastName: true, company: true, title: true, profileUrl: true },
      }),
    ),
  );
  return {
    accounts,
    lists: lists.map((l, i) => ({
      id: l.id,
      name: l.name,
      count: l._count.leads,
      /** People still to come from a search being collected. */
      coming: l.imports.reduce((n, imp) => n + Math.max(0, imp.maxLeads - imp.found), 0),
      sample: samples[i]!,
    })),
  };
}
export type BuilderOptions = Awaited<ReturnType<typeof builderOptions>>;
