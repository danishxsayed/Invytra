import type { Prisma, PrismaClient } from "@invytra/db";
import {
  DEFAULT_CAMPAIGN_SETTINGS,
  campaignSettingsSchema,
  sequenceProblems,
  stepSchema,
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

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name.").max(80, "Keep the name under 80 characters."),
  accountId: z.string().max(40).nullable(),
  listId: z.string().max(40).nullable(),
  steps: z.array(stepSchema).max(10, "Use at most 10 steps."),
  settings: campaignSettingsSchema,
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export function readSteps(raw: unknown): CampaignStep[] {
  return z.array(stepSchema).safeParse(raw).data ?? [];
}
export function readSettings(raw: unknown): CampaignSettings {
  return campaignSettingsSchema.safeParse(raw ?? {}).data ?? DEFAULT_CAMPAIGN_SETTINGS;
}

export async function getCampaign(prisma: PrismaClient, workspaceId: string, id: string) {
  const c = await prisma.campaign.findFirst({
    where: { id, workspaceId },
    include: { account: { select: { id: true, label: true, status: true } }, list: { select: { id: true, name: true } } },
  });
  if (!c) throw new CampaignNotFoundError();
  return { ...c, steps: readSteps(c.steps), settings: readSettings(c.settings) };
}
export type CampaignFull = Awaited<ReturnType<typeof getCampaign>>;

/** Account and list must belong to the same workspace. */
async function checkRefs(prisma: PrismaClient, workspaceId: string, input: CampaignInput): Promise<string | null> {
  if (input.accountId && !(await prisma.linkedinAccount.findFirst({ where: { id: input.accountId, workspaceId }, select: { id: true } }))) {
    return "Choose one of your LinkedIn accounts.";
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
      accountId: input.accountId,
      listId: input.listId,
      steps: input.steps as Prisma.InputJsonValue,
      settings: input.settings as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { ok: true, value: c.id };
}

/**
 * Drafts can change anything. Once launched, leads are part-way through the
 * steps, so existing steps keep their order and kind (texts and waits can
 * change, follow-ups can be added at the end), and the sender and list stay.
 */
export async function updateCampaign(prisma: PrismaClient, workspaceId: string, id: string, input: CampaignInput): Promise<Result> {
  const current = await getCampaign(prisma, workspaceId, id);
  const bad = await checkRefs(prisma, workspaceId, input);
  if (bad) return { ok: false, error: bad };
  if (current.status !== "DRAFT") {
    const reordered = current.steps.some((s, i) => input.steps[i]?.type !== s.type);
    if (reordered) return { ok: false, error: "This campaign has started: steps can be edited or added at the end, but not removed or reordered." };
    if (current.accountId && input.accountId !== current.accountId) return { ok: false, error: "The sending account can't change after launch." };
    if (current.listId && input.listId !== current.listId) return { ok: false, error: "The lead list can't change after launch." };
    const problems = sequenceProblems(input.steps);
    if (problems.length) return { ok: false, error: problems[0]! };
  }
  await prisma.campaign.update({
    where: { id: current.id },
    data: {
      name: input.name,
      accountId: input.accountId,
      listId: input.listId,
      steps: input.steps as Prisma.InputJsonValue,
      settings: input.settings as Prisma.InputJsonValue,
    },
  });
  return { ok: true, value: undefined };
}

/** What still stands in the way of launching (plain words; empty = ready). */
export async function launchProblems(prisma: PrismaClient, workspaceId: string, c: CampaignFull): Promise<string[]> {
  const out: string[] = [];
  if (!c.accountId) out.push("Choose the LinkedIn account that sends.");
  else if (c.account && c.account.status === "DISCONNECTED") out.push(`Connect “${c.account.label}” to LinkedIn first.`);
  if (!c.listId) out.push("Choose a lead list.");
  else if ((await prisma.lead.count({ where: { workspaceId, listId: c.listId } })) === 0) out.push("The lead list is empty.");
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

export async function listCampaigns(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { account: { select: { label: true, status: true } }, list: { select: { name: true } } },
  });
  const stats = await campaignStats(prisma, workspaceId, rows.map((r) => r.id));
  const listSizes = await prisma.lead.groupBy({
    by: ["listId"],
    where: { workspaceId, listId: { in: rows.map((r) => r.listId).filter((x): x is string => !!x) } },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    ...r,
    steps: readSteps(r.steps),
    stats: stats.get(r.id)!,
    listSize: listSizes.find((l) => l.listId === r.listId)?._count._all ?? 0,
  }));
}

export async function launchedCampaignCount(prisma: PrismaClient, workspaceId: string): Promise<number> {
  return prisma.campaign.count({ where: { workspaceId, startedAt: { not: null } } });
}

export const LEAD_FILTERS = {
  all: [],
  active: ["QUEUED", "IN_PROGRESS"],
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
    prisma.leadList.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, _count: { select: { leads: true } } } }),
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
    lists: lists.map((l, i) => ({ id: l.id, name: l.name, count: l._count.leads, sample: samples[i]! })),
  };
}
export type BuilderOptions = Awaited<ReturnType<typeof builderOptions>>;
