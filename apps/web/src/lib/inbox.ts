import type { Prisma, PrismaClient } from "@invytra/db";
import { MESSAGE_MAX, outreachTextProblem } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * Replies. Every query is scoped to the signed-in user's workspace through the
 * message's account (CLAUDE.md rule 0).
 */

export const INBOX_TABS = ["needs_reply", "all", "done"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export interface InboxQuery {
  tab?: InboxTab;
  accountId?: string;
  campaignId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

const needsReply: Prisma.InboxMessageWhereInput = { doneAt: null, answeredAt: null };

function whereFor(workspaceId: string, { tab = "needs_reply", accountId, campaignId, q }: InboxQuery): Prisma.InboxMessageWhereInput {
  const term = (q ?? "").trim().slice(0, 100);
  return {
    account: { workspaceId },
    ...(accountId && { accountId }),
    ...(campaignId && { campaignLead: { campaignId } }),
    ...(tab === "needs_reply" ? needsReply : tab === "done" ? { OR: [{ doneAt: { not: null } }, { answeredAt: { not: null } }] } : {}),
    ...(term && {
      AND: [{ OR: [{ fromName: { contains: term, mode: "insensitive" } }, { text: { contains: term, mode: "insensitive" } }] }],
    }),
  };
}

export async function inboxPage(prisma: PrismaClient, workspaceId: string, query: InboxQuery = {}) {
  const pageSize = query.pageSize ?? 50;
  const where = whereFor(workspaceId, query);
  const [total, rows] = await Promise.all([
    prisma.inboxMessage.count({ where }),
    prisma.inboxMessage.findMany({
      where,
      orderBy: [{ fetchedAt: "desc" }, { id: "asc" }],
      skip: (Math.max(1, query.page ?? 1) - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fromName: true,
        text: true,
        fetchedAt: true,
        doneAt: true,
        answeredAt: true,
        account: { select: { id: true, label: true, status: true } },
        replies: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, error: true, payload: true, createdAt: true, executedAt: true } },
        campaignLead: {
          select: {
            profileUrl: true,
            company: true,
            title: true,
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  return { total, rows };
}
export type InboxRow = Awaited<ReturnType<typeof inboxPage>>["rows"][number];

/** For the sidebar badge and the tab counts. */
export async function needsReplyCount(prisma: PrismaClient, workspaceId: string): Promise<number> {
  return prisma.inboxMessage.count({ where: { account: { workspaceId }, ...needsReply } });
}

export async function inboxTabCounts(prisma: PrismaClient, workspaceId: string, query: Omit<InboxQuery, "tab" | "page">) {
  const [needs, all, done] = await Promise.all(INBOX_TABS.map((tab) => prisma.inboxMessage.count({ where: whereFor(workspaceId, { ...query, tab }) })));
  return { needs_reply: needs!, all: all!, done: done! };
}

/** Mark replies handled (or not). Ids from other workspaces are ignored. */
export async function setDone(prisma: PrismaClient, workspaceId: string, ids: string[], done: boolean): Promise<Result<number>> {
  const r = await prisma.inboxMessage.updateMany({
    where: { id: { in: ids.slice(0, 500) }, account: { workspaceId } },
    data: done ? { doneAt: new Date() } : { doneAt: null, answeredAt: null },
  });
  return { ok: true, value: r.count };
}

/** Accounts and campaigns to filter by. */
export async function inboxFilterOptions(prisma: PrismaClient, workspaceId: string) {
  const [accounts, campaigns] = await Promise.all([
    prisma.linkedinAccount.findMany({ where: { workspaceId }, orderBy: { label: "asc" }, select: { id: true, label: true } }),
    prisma.campaign.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
  ]);
  return { accounts, campaigns };
}

/**
 * Reply to a conversation from Invytra. The web app only records the reply as a
 * queued REPLY action; the worker sends it from that account's browser within
 * seconds (CLAUDE.md rule 1).
 */
export async function sendReply(prisma: PrismaClient, workspaceId: string, messageId: string, text: string): Promise<Result<string>> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Write your reply first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX.toLocaleString()} characters.` };
  // Replies are sent exactly as written: nothing fills in {firstName} here.
  if (/\{[^{}]{1,40}\}/.test(body)) return { ok: false, error: "Replies are sent exactly as you write them, so write the name instead of a {placeholder}." };
  const problem = outreachTextProblem(body);
  if (problem) return { ok: false, error: `Your reply ${problem}.` };
  const m = await prisma.inboxMessage.findFirst({
    where: { id: messageId, account: { workspaceId } },
    select: { id: true, fromName: true, accountId: true, account: { select: { label: true, status: true } }, campaignLead: { select: { profileUrl: true } } },
  });
  if (!m) return { ok: false, error: "That conversation wasn't found." };
  if (m.account.status !== "ACTIVE") return { ok: false, error: `“${m.account.label}” isn't connected and active, so it can't send right now.` };
  const sending = await prisma.action.count({ where: { inboxMessageId: m.id, type: "REPLY", status: { in: ["QUEUED", "RUNNING"] } } });
  if (sending) return { ok: false, error: "Your last reply to this conversation is still being sent." };
  const a = await prisma.action.create({
    data: {
      accountId: m.accountId,
      type: "REPLY",
      targetUrl: m.campaignLead?.profileUrl ?? null,
      payload: { name: m.fromName, text: body },
      inboxMessageId: m.id,
      status: "QUEUED",
      scheduledAt: new Date(),
    },
    select: { id: true },
  });
  return { ok: true, value: a.id };
}
