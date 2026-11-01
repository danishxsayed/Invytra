import type { Prisma, PrismaClient } from "@invytra/db";
import { DEFAULT_EMAIL_SEQUENCE, emailSequenceSchema, localDayStart, unknownVars, waitingText, type EmailStep } from "@invytra/shared";
import { isSuppressed } from "./email-contacts";
import { z } from "zod";
import type { Result } from "./accounts";

/*
 * Email campaigns: create, leads (CSV), sequence, mailboxes, launch / pause / resume,
 * delete, and what the pages show. Scoped to the signed-in workspace (CLAUDE.md rule 0).
 * The worker does the sending.
 */

const NOT_FOUND = { ok: false as const, error: "Campaign not found." };
export const campaignNameSchema = z.string().trim().min(1, "Give the campaign a name.").max(80);

const find = (prisma: PrismaClient, workspaceId: string, id: string) => prisma.emailCampaign.findFirst({ where: { id, workspaceId } });

export async function createEmailCampaign(prisma: PrismaClient, workspaceId: string, name: string): Promise<Result<{ id: string }>> {
  const c = await prisma.emailCampaign.create({ data: { workspaceId, name, steps: DEFAULT_EMAIL_SEQUENCE as unknown as Prisma.InputJsonValue }, select: { id: true } });
  return { ok: true, value: c };
}

export async function renameEmailCampaign(prisma: PrismaClient, workspaceId: string, id: string, name: string): Promise<Result> {
  const r = await prisma.emailCampaign.updateMany({ where: { id, workspaceId }, data: { name } });
  return r.count ? { ok: true, value: undefined } : NOT_FOUND;
}

/** The sequence can change while the campaign is a draft or paused. */
export async function saveEmailSequence(prisma: PrismaClient, workspaceId: string, id: string, steps: EmailStep[]): Promise<Result> {
  const c = await find(prisma, workspaceId, id);
  if (!c) return NOT_FOUND;
  if (c.status === "ACTIVE") return { ok: false, error: "Pause the campaign to change its emails." };
  if (c.status === "COMPLETED") return { ok: false, error: "This campaign has finished." };
  await prisma.emailCampaign.update({ where: { id }, data: { steps: steps as unknown as Prisma.InputJsonValue } });
  return { ok: true, value: undefined };
}

export async function setCampaignMailboxes(prisma: PrismaClient, workspaceId: string, id: string, mailboxIds: string[]): Promise<Result> {
  const c = await find(prisma, workspaceId, id);
  if (!c) return NOT_FOUND;
  const own = await prisma.emailAccount.findMany({ where: { workspaceId, id: { in: mailboxIds } }, select: { id: true } });
  if (own.length !== new Set(mailboxIds).size) return { ok: false, error: "Mailbox not found." };
  if (c.status === "ACTIVE" && own.length === 0) return { ok: false, error: "An active campaign needs at least one mailbox. Pause it first." };
  await prisma.$transaction([
    prisma.emailCampaignMailbox.deleteMany({ where: { campaignId: id } }),
    prisma.emailCampaignMailbox.createMany({ data: own.map((m) => ({ campaignId: id, emailAccountId: m.id })) }),
  ]);
  return { ok: true, value: undefined };
}

export interface AddContactsResult {
  added: number;
  alreadyInCampaign: number;
  /** On the suppression list (unsubscribed, hard bounce, blocked by you). */
  suppressed: number;
  unsubscribed: number;
  bounced: number;
  /** Verification said the address doesn't exist. */
  invalid: number;
  /** Replied or bounced in another campaign. */
  doNotContact: number;
}

/** Adds the contacts of one or more lists to a campaign, skipping anyone who must not be emailed. */
export async function addListsToCampaign(prisma: PrismaClient, workspaceId: string, id: string, listIds: string[], now = new Date()): Promise<Result<AddContactsResult>> {
  const c = await find(prisma, workspaceId, id);
  if (!c) return NOT_FOUND;
  if (c.status === "COMPLETED") return { ok: false, error: "This campaign has finished. Start a new one." };
  const lists = await prisma.emailList.count({ where: { workspaceId, id: { in: listIds } } });
  if (!listIds.length || lists !== new Set(listIds).size) return { ok: false, error: "Choose a list." };
  const contacts = await prisma.emailContact.findMany({ where: { workspaceId, lists: { some: { listId: { in: listIds } } } } });
  const emails = contacts.map((x) => x.email);
  const [here, stop, supp] = await Promise.all([
    prisma.emailLead.findMany({ where: { campaignId: id, email: { in: emails } }, select: { email: true } }).then((r) => new Set(r.map((x) => x.email))),
    prisma.emailLead.findMany({ where: { workspaceId, email: { in: emails }, status: { in: ["REPLIED", "BOUNCED"] } }, select: { email: true } }).then((r) => new Set(r.map((x) => x.email))),
    prisma.emailSuppression.findMany({ where: { workspaceId }, select: { email: true } }).then((r) => new Set(r.map((x) => x.email))),
  ]);
  const res: AddContactsResult = { added: 0, alreadyInCampaign: 0, suppressed: 0, unsubscribed: 0, bounced: 0, invalid: 0, doNotContact: 0 };
  const fresh = contacts.filter((x) => {
    if (here.has(x.email)) return void res.alreadyInCampaign++;
    if (!x.subscribed) return void res.unsubscribed++;
    if (x.bounceStatus === "HARD") return void res.bounced++;
    if (isSuppressed(supp, x.email)) return void res.suppressed++;
    if (x.verification === "INVALID") return void res.invalid++;
    if (stop.has(x.email)) return void res.doNotContact++;
    return true;
  });
  const r = await prisma.emailLead.createMany({
    data: fresh.map((x) => ({
      workspaceId,
      campaignId: id,
      contactId: x.id,
      email: x.email,
      firstName: x.firstName,
      lastName: x.lastName,
      company: x.company,
      title: x.title,
      website: x.website,
      vars: (x.vars ?? {}) as Prisma.InputJsonValue,
      nextAt: c.status === "DRAFT" ? null : now,
    })),
    skipDuplicates: true,
  });
  res.added = r.count;
  return { ok: true, value: res };
}

/** What still stops a launch, in plain words (empty = ready). */
/** The custom variables a campaign may use: the workspace's, plus columns of older imports. */
export async function knownVariables(prisma: PrismaClient, workspaceId: string, columns: string[] = []): Promise<string[]> {
  const vs = await prisma.emailVariable.findMany({ where: { workspaceId }, select: { key: true } });
  return [...new Set([...vs.map((v) => v.key), ...columns])];
}

export async function launchProblems(prisma: PrismaClient, c: { id: string; workspaceId: string; steps: unknown; columns: string[] }): Promise<string[]> {
  const problems: string[] = [];
  const steps = emailSequenceSchema.safeParse(c.steps);
  if (!steps.success) problems.push(steps.error.issues[0]!.message);
  else {
    const unknown = unknownVars(steps.data, await knownVariables(prisma, c.workspaceId, c.columns));
    if (unknown.length) problems.push(`Unknown variable ${unknown.map((u) => `{{${u}}}`).join(", ")}: create it under Contacts → Variables, or import a CSV column with that name.`);
  }
  const boxes = await prisma.emailCampaignMailbox.findMany({ where: { campaignId: c.id }, include: { emailAccount: { select: { status: true } } } });
  if (!boxes.length) problems.push("Choose at least one mailbox to send from.");
  else if (!boxes.some((b) => b.emailAccount.status === "ACTIVE")) problems.push("None of the chosen mailboxes can send right now (paused or needs attention).");
  if ((await prisma.emailLead.count({ where: { campaignId: c.id, status: "ACTIVE" } })) === 0) problems.push("Add leads to email.");
  return problems;
}

export async function launchEmailCampaign(prisma: PrismaClient, workspaceId: string, id: string, now = new Date()): Promise<Result> {
  const c = await find(prisma, workspaceId, id);
  if (!c) return NOT_FOUND;
  if (c.status !== "DRAFT") return { ok: false, error: "This campaign was already launched." };
  const problems = await launchProblems(prisma, c);
  if (problems.length) return { ok: false, error: problems[0]! };
  await prisma.$transaction([
    prisma.emailLead.updateMany({ where: { campaignId: id, status: "ACTIVE", nextAt: null }, data: { nextAt: now } }),
    prisma.emailCampaign.update({ where: { id }, data: { status: "ACTIVE", launchedAt: now } }),
  ]);
  return { ok: true, value: undefined };
}

export async function setEmailCampaignPaused(prisma: PrismaClient, workspaceId: string, id: string, paused: boolean): Promise<Result> {
  const c = await find(prisma, workspaceId, id);
  if (!c) return NOT_FOUND;
  if (paused && c.status !== "ACTIVE") return { ok: false, error: "Only a running campaign can be paused." };
  if (!paused) {
    if (c.status !== "PAUSED") return { ok: false, error: "Only a paused campaign can be resumed." };
    const problems = (await launchProblems(prisma, c)).filter((p) => !p.startsWith("Add leads"));
    if (problems.length) return { ok: false, error: problems[0]! };
  }
  await prisma.emailCampaign.update({ where: { id }, data: { status: paused ? "PAUSED" : "ACTIVE" } });
  return { ok: true, value: undefined };
}

export async function deleteEmailCampaign(prisma: PrismaClient, workspaceId: string, id: string): Promise<Result> {
  const r = await prisma.emailCampaign.deleteMany({ where: { id, workspaceId } });
  return r.count ? { ok: true, value: undefined } : NOT_FOUND;
}

// ---------------------------------------------------------------- reading

async function statsFor(prisma: PrismaClient, campaignIds: string[]) {
  const [byStatus, sent, contacted] = await Promise.all([
    prisma.emailLead.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaignIds } }, _count: true }),
    Promise.all(campaignIds.map((id) => prisma.emailSend.count({ where: { kind: "CAMPAIGN", status: "SENT", emailLead: { campaignId: id } } }))),
    prisma.emailLead.groupBy({ by: ["campaignId"], where: { campaignId: { in: campaignIds }, lastSentAt: { not: null } }, _count: true }),
  ]);
  return new Map(
    campaignIds.map((id, i) => {
      const n = (s: string) => byStatus.find((b) => b.campaignId === id && b.status === s)?._count ?? 0;
      const leads = ["ACTIVE", "COMPLETED", "REPLIED", "BOUNCED", "SKIPPED"].reduce((a, s) => a + n(s), 0);
      const reached = contacted.find((x) => x.campaignId === id)?._count ?? 0;
      return [id, { leads, active: n("ACTIVE"), completed: n("COMPLETED"), replied: n("REPLIED"), bounced: n("BOUNCED"), skipped: n("SKIPPED"), sent: sent[i]!, contacted: reached }];
    }),
  );
}
export type CampaignStats = NonNullable<Awaited<ReturnType<typeof statsFor>> extends Map<string, infer V> ? V : never>;

export async function listEmailCampaigns(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.emailCampaign.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { mailboxes: true } } } });
  const stats = await statsFor(prisma, rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, createdAt: r.createdAt, mailboxes: r._count.mailboxes, stats: stats.get(r.id)! }));
}

export const LEAD_FILTERS = ["ALL", "ACTIVE", "COMPLETED", "REPLIED", "BOUNCED", "SKIPPED"] as const;
export type LeadFilter = (typeof LEAD_FILTERS)[number];

/** For a running campaign: each of its mailboxes, and why it isn't sending right now (null = it can send). */
async function sendingStatus(prisma: PrismaClient, campaignId: string, now: Date) {
  const boxes = await prisma.emailCampaignMailbox.findMany({ where: { campaignId }, include: { emailAccount: true } });
  return Promise.all(
    boxes.map(async ({ emailAccount: m }) => {
      const sentToday = await prisma.emailSend.count({ where: { emailAccountId: m.id, status: "SENT", kind: { not: "WARMUP" }, createdAt: { gte: localDayStart(now, m.timeZone) } } });
      return { email: m.email, waiting: waitingText({ ...m, days: m.sendDays, sentToday }, now) };
    }),
  );
}

export async function getEmailCampaign(prisma: PrismaClient, workspaceId: string, id: string, filter: LeadFilter = "ALL", now = new Date()) {
  const c = await prisma.emailCampaign.findFirst({ where: { id, workspaceId }, include: { mailboxes: { select: { emailAccountId: true } } } });
  if (!c) return null;
  const [stats, leads, sample, problems] = await Promise.all([
    statsFor(prisma, [id]),
    prisma.emailLead.findMany({
      where: { campaignId: id, ...(filter !== "ALL" && { status: filter }) },
      orderBy: [{ lastSentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
      select: { id: true, email: true, firstName: true, lastName: true, company: true, status: true, stepIndex: true, nextAt: true, lastSentAt: true, reason: true, emailAccount: { select: { email: true } } },
    }),
    prisma.emailLead.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" }, take: 5, select: { email: true, firstName: true, lastName: true, company: true, title: true, website: true, vars: true } }),
    c.status === "DRAFT" ? launchProblems(prisma, c) : Promise.resolve([] as string[]),
  ]);
  const sending = c.status === "ACTIVE" ? await sendingStatus(prisma, id, now) : [];
  const due = c.status === "ACTIVE" ? await prisma.emailLead.count({ where: { campaignId: id, status: "ACTIVE", nextAt: { lte: now } } }) : 0;
  const lastSend = await prisma.emailSend.findFirst({ where: { kind: "CAMPAIGN", emailLead: { campaignId: id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const steps = emailSequenceSchema.safeParse(c.steps);
  const variables = await knownVariables(prisma, workspaceId, c.columns);
  const fallbacks = Object.fromEntries((await prisma.emailVariable.findMany({ where: { workspaceId, fallback: { not: "" } } })).map((v) => [v.key, v.fallback]));
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    launchedAt: c.launchedAt,
    steps: (steps.success ? steps.data : (c.steps as EmailStep[])) ?? [],
    columns: variables,
    mailboxIds: c.mailboxes.map((m) => m.emailAccountId),
    stats: stats.get(id)!,
    leads,
    sample: sample.map((s) => ({ ...s, vars: { ...fallbacks, ...((s.vars ?? {}) as Record<string, string>) } })),
    problems,
    sequenceOk: steps.success && unknownVars(steps.data, variables).length === 0,
    sending,
    due,
    lastSendAt: lastSend?.createdAt ?? null,
  };
}
export type EmailCampaignView = NonNullable<Awaited<ReturnType<typeof getEmailCampaign>>>;
