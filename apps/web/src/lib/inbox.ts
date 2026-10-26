import type { Prisma, PrismaClient } from "@invytra/db";
import { MESSAGE_MAX, outreachTextProblem } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * The inbox: LinkedIn conversations of the workspace's accounts. Every query is
 * scoped to the signed-in user's workspace through the conversation's account
 * (CLAUDE.md rule 0).
 */

export const INBOX_FILTERS = ["needs_reply", "unread", "replied", "all", "done"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export interface InboxQuery {
  filter?: InboxFilter;
  accountId?: string;
  campaignId?: string;
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Their message is the latest and you haven't marked it done. */
const needsReply: Prisma.ConversationWhereInput = { lastFromMe: false, doneAt: null };

const FILTER_WHERE: Record<InboxFilter, Prisma.ConversationWhereInput> = {
  needs_reply: needsReply,
  unread: { unread: true },
  replied: { messages: { some: { fromMe: false } } },
  all: {},
  done: { OR: [{ doneAt: { not: null } }, { lastFromMe: true }] },
};

function whereFor(workspaceId: string, { filter = "needs_reply", accountId, campaignId, tag, q }: InboxQuery): Prisma.ConversationWhereInput {
  const term = (q ?? "").trim().slice(0, 100);
  return {
    account: { workspaceId },
    ...(accountId && { accountId }),
    ...(campaignId && { campaignLead: { campaignId } }),
    ...(tag && { tags: { has: tag } }),
    ...FILTER_WHERE[filter],
    ...(term && {
      AND: [
        {
          OR: [
            { participantName: { contains: term, mode: "insensitive" } },
            { messages: { some: { text: { contains: term, mode: "insensitive" } } } },
            { campaignLead: { company: { contains: term, mode: "insensitive" } } },
          ],
        },
      ],
    }),
  };
}

const LEAD_SELECT = {
  id: true,
  profileUrl: true,
  title: true,
  company: true,
  state: true,
  reason: true,
  step: true,
  campaign: { select: { id: true, name: true, steps: true } },
} as const;

export async function conversationList(prisma: PrismaClient, workspaceId: string, query: InboxQuery = {}) {
  const pageSize = query.pageSize ?? 50;
  const where = whereFor(workspaceId, query);
  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      skip: (Math.max(1, query.page ?? 1) - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        participantName: true,
        lastMessageText: true,
        lastFromMe: true,
        lastMessageAt: true,
        unread: true,
        doneAt: true,
        tags: true,
        account: { select: { id: true, label: true, timezone: true } },
        campaignLead: { select: LEAD_SELECT },
      },
    }),
  ]);
  return { total, rows };
}
export type ConversationRow = Awaited<ReturnType<typeof conversationList>>["rows"][number];

/** One conversation with its messages and replies still on their way. */
export async function getConversation(prisma: PrismaClient, workspaceId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, account: { workspaceId } },
    select: {
      id: true,
      participantName: true,
      lastFromMe: true,
      unread: true,
      doneAt: true,
      tags: true,
      account: { select: { id: true, label: true, status: true, timezone: true } },
      campaignLead: { select: LEAD_SELECT },
      messages: { orderBy: { sentAt: "asc" }, take: 300, select: { id: true, fromMe: true, text: true, sentAt: true } },
      replies: {
        where: { type: "REPLY", status: { not: "SUCCEEDED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, error: true, payload: true, createdAt: true },
      },
    },
  });
}
export type ConversationFull = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

/** For the sidebar badge. */
export async function needsReplyCount(prisma: PrismaClient, workspaceId: string): Promise<number> {
  return prisma.conversation.count({ where: { account: { workspaceId }, ...needsReply } });
}

export async function inboxCounts(prisma: PrismaClient, workspaceId: string, query: Omit<InboxQuery, "filter" | "page">) {
  const counts = await Promise.all(INBOX_FILTERS.map((filter) => prisma.conversation.count({ where: whereFor(workspaceId, { ...query, filter }) })));
  return Object.fromEntries(INBOX_FILTERS.map((f, i) => [f, counts[i]!])) as Record<InboxFilter, number>;
}

/** Mark conversations handled (or not). Ids from other workspaces are ignored. */
export async function setDone(prisma: PrismaClient, workspaceId: string, ids: string[], done: boolean): Promise<Result<number>> {
  const r = await prisma.conversation.updateMany({
    where: { id: { in: ids.slice(0, 500) }, account: { workspaceId } },
    data: { doneAt: done ? new Date() : null, ...(done ? {} : { lastFromMe: false }) },
  });
  return { ok: true, value: r.count };
}

export const SUGGESTED_TAGS = ["Interested", "Not interested", "Meeting booked", "Follow up later", "Wrong person"];

/** Replace a conversation's tags (each 1–30 characters, at most 8). */
export async function setTags(prisma: PrismaClient, workspaceId: string, id: string, tags: string[]): Promise<Result<string[]>> {
  const clean = [...new Set(tags.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean))];
  if (clean.some((t) => t.length > 30)) return { ok: false, error: "Keep tags under 30 characters." };
  if (clean.length > 8) return { ok: false, error: "Use at most 8 tags on one conversation." };
  const r = await prisma.conversation.updateMany({ where: { id, account: { workspaceId } }, data: { tags: clean } });
  if (r.count === 0) return { ok: false, error: "That conversation wasn't found." };
  return { ok: true, value: clean };
}

/** Accounts, campaigns and tags to filter by. */
export async function inboxFilterOptions(prisma: PrismaClient, workspaceId: string) {
  const [accounts, campaigns, tagRows] = await Promise.all([
    prisma.linkedinAccount.findMany({ where: { workspaceId }, orderBy: { label: "asc" }, select: { id: true, label: true } }),
    prisma.campaign.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(c.tags) AS tag FROM conversations c
      JOIN linkedin_accounts a ON a.id = c.account_id WHERE a.workspace_id = ${workspaceId} ORDER BY 1`,
  ]);
  return { accounts, campaigns, tags: tagRows.map((t) => t.tag) };
}

/**
 * Reply in a conversation from Invytra. The web app only records the reply as a
 * queued REPLY action; the worker sends it from that account's browser within
 * seconds (CLAUDE.md rule 1).
 */
export async function sendReply(prisma: PrismaClient, workspaceId: string, conversationId: string, text: string): Promise<Result<string>> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Write your reply first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX.toLocaleString()} characters.` };
  // Replies are sent exactly as written: nothing fills in {firstName} here.
  if (/\{[^{}]{1,40}\}/.test(body)) return { ok: false, error: "Replies are sent exactly as you write them, so write the name instead of a {placeholder}." };
  const problem = outreachTextProblem(body);
  if (problem) return { ok: false, error: `Your reply ${problem}.` };
  const c = await prisma.conversation.findFirst({
    where: { id: conversationId, account: { workspaceId } },
    select: { id: true, participantName: true, accountId: true, account: { select: { label: true, status: true } }, campaignLead: { select: { profileUrl: true } } },
  });
  if (!c) return { ok: false, error: "That conversation wasn't found." };
  if (c.account.status !== "ACTIVE") return { ok: false, error: `“${c.account.label}” isn't connected and active, so it can't send right now.` };
  const sending = await prisma.action.count({ where: { conversationId: c.id, type: "REPLY", status: { in: ["QUEUED", "RUNNING"] } } });
  if (sending) return { ok: false, error: "Your last reply in this conversation is still being sent." };
  const a = await prisma.action.create({
    data: {
      accountId: c.accountId,
      type: "REPLY",
      targetUrl: c.campaignLead?.profileUrl ?? null,
      payload: { name: c.participantName, text: body },
      conversationId: c.id,
      status: "QUEUED",
      scheduledAt: new Date(),
    },
    select: { id: true },
  });
  return { ok: true, value: a.id };
}

const ACTIVE = ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"];

/**
 * Stop the campaign for this person (you're taking it from here). Anything of
 * theirs still waiting in the queue is cancelled; resuming carries on where they were.
 */
export async function setLeadPaused(prisma: PrismaClient, workspaceId: string, conversationId: string, paused: boolean): Promise<Result> {
  const c = await prisma.conversation.findFirst({
    where: { id: conversationId, account: { workspaceId } },
    select: { campaignLead: { select: { id: true, state: true, reason: true } } },
  });
  const lead = c?.campaignLead;
  if (!lead) return { ok: false, error: "This conversation isn't with someone from a campaign." };
  if (paused) {
    if (!ACTIVE.includes(lead.state)) return { ok: false, error: "Their campaign steps are already finished or stopped." };
    await prisma.$transaction([
      prisma.campaignLead.update({ where: { id: lead.id }, data: { state: "PAUSED", reason: `PAUSED:${lead.state}`, nextAt: null } }),
      prisma.action.updateMany({ where: { campaignLeadId: lead.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() } }),
    ]);
  } else {
    if (lead.state !== "PAUSED") return { ok: true, value: undefined };
    const to = (lead.reason ?? "").split(":")[1] ?? "IN_PROGRESS";
    const state = (["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT", "DONE", "REPLIED", "NOT_ACCEPTED", "SKIPPED", "FAILED"].includes(to) ? to : "IN_PROGRESS") as "IN_PROGRESS";
    await prisma.campaignLead.update({ where: { id: lead.id }, data: { state, reason: null, nextAt: ACTIVE.includes(state) ? new Date() : null } });
  }
  return { ok: true, value: undefined };
}
