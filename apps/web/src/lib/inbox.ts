import { UnipileError, recordReply, unipileFromEnv, type Prisma, type PrismaClient, type UnipileClient } from "@invytra/db";
import { MESSAGE_MAX, outreachTextProblem, parseProfileUrl } from "@invytra/shared";
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
      account: { select: { id: true, label: true, status: true, timezone: true, engine: true } },
      campaignLead: { select: LEAD_SELECT },
      messages: { orderBy: { sentAt: "asc" }, take: 300, select: { id: true, fromMe: true, text: true, sentAt: true } },
      replies: {
        // (error is empty while it waits; "NOT error = CANCELLED" alone would drop those too)
        where: { type: "REPLY", status: { not: "SUCCEEDED" }, OR: [{ error: null }, { NOT: { error: { startsWith: "CANCELLED" } } }] },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, error: true, payload: true, createdAt: true, scheduledAt: true },
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
export async function sendReply(
  prisma: PrismaClient,
  workspaceId: string,
  conversationId: string,
  text: string,
  /** For accounts connected through Unipile: replies go straight out (no queue, no browser). */
  unipile: UnipileClient | null = unipileFromEnv(),
): Promise<Result<string>> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Write your reply first." };
  if (body.length > MESSAGE_MAX) return { ok: false, error: `Keep it under ${MESSAGE_MAX.toLocaleString()} characters.` };
  // Replies are sent exactly as written: nothing fills in {firstName} here.
  if (/\{[^{}]{1,40}\}/.test(body)) return { ok: false, error: "Replies are sent exactly as you write them, so write the name instead of a {placeholder}." };
  const problem = outreachTextProblem(body);
  if (problem) return { ok: false, error: `Your reply ${problem}.` };
  const c = await prisma.conversation.findFirst({
    where: { id: conversationId, account: { workspaceId } },
    select: {
      id: true,
      participantName: true,
      accountId: true,
      externalId: true,
      account: { select: { label: true, status: true, engine: true, unipileAccountId: true } },
      campaignLead: { select: { profileUrl: true } },
    },
  });
  if (!c) return { ok: false, error: "That conversation wasn't found." };
  if (c.account.status !== "ACTIVE") return { ok: false, error: `“${c.account.label}” isn't connected and active, so it can't send right now.` };
  const sending = await prisma.action.count({ where: { conversationId: c.id, type: "REPLY", status: { in: ["QUEUED", "RUNNING"] } } });
  if (sending) return { ok: false, error: "Your last reply in this conversation is still being sent." };
  const direct = c.account.engine === "UNIPILE" && c.account.unipileAccountId && unipile;
  const a = await prisma.action.create({
    data: {
      accountId: c.accountId,
      type: "REPLY",
      targetUrl: c.campaignLead?.profileUrl ?? null,
      payload: { name: c.participantName, text: body },
      conversationId: c.id,
      status: direct ? "RUNNING" : "QUEUED",
      scheduledAt: new Date(),
      ...(direct && { attempts: 1 }),
    },
    select: { id: true },
  });
  if (!direct) return { ok: true, value: a.id };
  return sendViaUnipile(prisma, unipile, { ...c, unipileAccountId: c.account.unipileAccountId! }, body, a.id);
}

/**
 * A reply from an account connected through Unipile: sent right away (about a second), the
 * way LinkedIn itself would. Logged like any action (CLAUDE.md rule 9); never retried.
 */
async function sendViaUnipile(
  prisma: PrismaClient,
  client: UnipileClient,
  c: { id: string; accountId: string; externalId: string | null; unipileAccountId: string; campaignLead: { profileUrl: string } | null },
  body: string,
  actionId: string,
): Promise<Result<string>> {
  const started = Date.now();
  try {
    let chatId = c.externalId;
    if (chatId) {
      await client.sendInChat(chatId, body, c.unipileAccountId);
    } else {
      const slug = c.campaignLead ? parseProfileUrl(c.campaignLead.profileUrl) : null;
      if (!slug?.ok) throw new Error("This conversation hasn't been read yet. Click “Check now”, then send again.");
      const who = await client.user(c.unipileAccountId, slug.slug);
      chatId = (await client.startChat(c.unipileAccountId, who.provider_id, body)).chat_id;
      await prisma.conversation.update({ where: { id: c.id }, data: { externalId: chatId } });
    }
    const now = new Date();
    await prisma.action.update({ where: { id: actionId }, data: { status: "SUCCEEDED", executedAt: now, durationMs: Date.now() - started } });
    await recordReply(prisma, c.id, body, now);
    await prisma.linkedinAccount.update({ where: { id: c.accountId }, data: { lastActiveAt: now } });
    return { ok: true, value: actionId };
  } catch (e) {
    const disconnected = e instanceof UnipileError && e.disconnected;
    const error = disconnected ? "LOGGED_OUT" : e instanceof Error ? e.message : String(e);
    await prisma.action.update({ where: { id: actionId }, data: { status: "FAILED", error, executedAt: new Date(), durationMs: Date.now() - started } });
    if (disconnected) {
      await prisma.linkedinAccount.update({ where: { id: c.accountId }, data: { status: "NEEDS_ATTENTION", statusReason: "LOGGED_OUT" } });
      return { ok: false, error: "LinkedIn logged this account out. Reconnect it on the Accounts page, then send again." };
    }
    if (e instanceof UnipileError && e.status === 422) {
      return { ok: false, error: "Not sent: LinkedIn doesn't allow replies in this conversation (for example a sponsored message, or someone who isn't a connection)." };
    }
    return { ok: false, error: `Not sent: ${error}` };
  }
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

/** Cancel a reply that hasn't been sent yet. */
export async function cancelReply(prisma: PrismaClient, workspaceId: string, actionId: string): Promise<Result> {
  const r = await prisma.action.updateMany({
    where: { id: actionId, type: "REPLY", status: "QUEUED", account: { workspaceId } },
    data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() },
  });
  if (r.count === 0) {
    // A reply that wasn't sent: hide it from the conversation (Activity keeps why it failed).
    const failed = await prisma.action.findFirst({ where: { id: actionId, type: "REPLY", status: "FAILED", account: { workspaceId } }, select: { error: true } });
    if (!failed) return { ok: false, error: "It's already being sent, or was sent." };
    await prisma.action.update({ where: { id: actionId }, data: { error: `CANCELLED (dismissed): ${failed.error ?? ""}`.slice(0, 2000) } });
  }
  return { ok: true, value: undefined };
}

/** Ask for a fresh look at LinkedIn for each connected account whose last check is older than this. */
const CHECK_EVERY_MS = 3 * 60_000;
/** Accounts connected through Unipile are read through its API (no browser), so much more often. */
const UNIPILE_CHECK_EVERY_MS = 15_000;

/**
 * The inbox is open: queue an inbox check for each connected account that hasn't
 * been checked in the last few minutes (and has none waiting). Returns when the
 * accounts were last checked, oldest first.
 */
export async function requestInboxCheck(prisma: PrismaClient, workspaceId: string, now = new Date()): Promise<{ lastChecked: Date | null; queued: number }> {
  const accounts = await prisma.linkedinAccount.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, engine: true } });
  let queued = 0;
  let oldest: Date | null = null;
  for (const { id, engine } of accounts) {
    const every = engine === "UNIPILE" ? UNIPILE_CHECK_EVERY_MS : CHECK_EVERY_MS;
    // A routine check already waiting at its normal pace: bring it forward instead of adding another.
    const routine = (await prisma.action.findMany({ where: { accountId: id, type: "INBOX_SYNC", status: "QUEUED" }, select: { id: true, payload: true } }))
      .filter((a) => (a.payload as { onDemand?: unknown } | null)?.onDemand !== true)
      .map((a) => a.id);
    if (routine.length) {
      await prisma.action.updateMany({ where: { id: { in: routine }, status: "QUEUED" }, data: { payload: { onDemand: true }, scheduledAt: now } });
    }
    const [pending, last] = await Promise.all([
      prisma.action.count({ where: { accountId: id, type: "INBOX_SYNC", status: { in: ["QUEUED", "RUNNING"] } } }),
      prisma.action.findFirst({ where: { accountId: id, type: "INBOX_SYNC", status: "SUCCEEDED" }, orderBy: { executedAt: "desc" }, select: { executedAt: true } }),
    ]);
    const at = last?.executedAt ?? null;
    if (!oldest || !at || at < oldest) oldest = at ?? oldest;
    if (pending > 0 || (at && now.getTime() - at.getTime() < every)) continue;
    await prisma.action.create({ data: { accountId: id, type: "INBOX_SYNC", status: "QUEUED", payload: { onDemand: true }, scheduledAt: now } });
    queued++;
  }
  return { lastChecked: oldest, queued };
}
