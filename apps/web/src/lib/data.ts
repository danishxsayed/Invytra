import { usageFor, type Prisma, type PrismaClient } from "@invytra/db";
import { DEFAULT_LIMITS, DEFAULT_WORKING_HOURS, effectiveLimits, limitsSchema, warmupDay, workingHoursSchema } from "@invytra/shared";
import { proxyHost } from "./accounts";

/*
 * Every function here takes the workspace id FIRST and filters by it.
 * Pages must pass the id from the signed-in session — never from the URL.
 */

export async function accountsOverview(prisma: PrismaClient, workspaceId: string, onlyId?: string) {
  const accounts = await prisma.linkedinAccount.findMany({
    where: { workspaceId, ...(onlyId && { id: onlyId }) },
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      statusReason: true,
      timezone: true,
      limits: true,
      workingHours: true,
      lastActiveAt: true,
      profileName: true,
      profileUrl: true,
      connectedAt: true,
      warmupUntil: true,
      sessionUpdatedAt: true,
      proxyUrl: true,
      premium: true,
      premiumOverride: true,
      premiumCheckedAt: true,
    },
  });
  const now = new Date();
  return Promise.all(
    accounts.map(async (a) => {
      const [usage, queued, lastAction] = await Promise.all([
        usageFor(prisma, a.id),
        prisma.action.count({ where: { accountId: a.id, status: { in: ["QUEUED", "RUNNING"] } } }),
        prisma.action.findFirst({
          where: { accountId: a.id, status: { in: ["SUCCEEDED", "FAILED", "SKIPPED"] } },
          orderBy: { executedAt: "desc" },
          select: { type: true, status: true, executedAt: true },
        }),
      ]);
      const limits = limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS;
      return {
        id: a.id,
        label: a.label,
        status: a.status,
        statusReason: a.statusReason,
        timezone: a.timezone,
        lastActiveAt: a.lastActiveAt,
        profileName: a.profileName,
        profileUrl: a.profileUrl,
        connectedAt: a.connectedAt,
        hasSession: !!a.sessionUpdatedAt,
        /** LinkedIn plan: what the user set, else what was detected; null = not known yet. */
        premium: a.premiumOverride ?? a.premium,
        premiumDetected: a.premium,
        premiumOverride: a.premiumOverride,
        premiumCheckedAt: a.premiumCheckedAt,
        proxy: proxyHost(a.proxyUrl),
        warmupUntil: a.warmupUntil,
        warmupDay: warmupDay(a.warmupUntil, now),
        /** What the account is set to. */
        settings: limits,
        /** Today's caps as the worker enforces them (warm-up and daily variation applied). */
        limits: effectiveLimits(limits, { accountId: a.id, timeZone: a.timezone, warmupUntil: a.warmupUntil, now }),
        workingHours: workingHoursSchema.safeParse(a.workingHours).data ?? DEFAULT_WORKING_HOURS,
        usage,
        queued,
        lastAction,
      };
    }),
  );
}
export type AccountOverview = Awaited<ReturnType<typeof accountsOverview>>[number];

export interface ActivityFilter {
  status?: "SUCCEEDED" | "FAILED" | "SKIPPED" | "QUEUED";
  type?: "PROFILE_VISIT" | "CONNECTION_REQUEST" | "CHECK_CONNECTION" | "MESSAGE" | "INBOX_SYNC" | "SEARCH_PAGE" | "LIKE_POST" | "WITHDRAW_INVITE" | "REPLY" | "FOLLOW_PROFILE";
  accountId?: string;
  campaignId?: string;
  take?: number;
  skip?: number;
}

function activityWhere(workspaceId: string, f: ActivityFilter): Prisma.ActionWhereInput {
  return {
    account: { workspaceId },
    ...(f.accountId && { accountId: f.accountId }),
    ...(f.type && { type: f.type }),
    ...(f.campaignId && { campaignLead: { campaignId: f.campaignId } }),
    ...(f.status ? (f.status === "QUEUED" ? { status: { in: ["QUEUED", "RUNNING"] } } : { status: f.status }) : {}),
  };
}

export async function activityCount(prisma: PrismaClient, workspaceId: string, filter: ActivityFilter = {}) {
  return prisma.action.count({ where: activityWhere(workspaceId, filter) });
}

export async function recentActivity(prisma: PrismaClient, workspaceId: string, filter: ActivityFilter = {}) {
  return prisma.action.findMany({
    where: activityWhere(workspaceId, filter),
    orderBy: [{ executedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: filter.take ?? 100,
    skip: filter.skip ?? 0,
    select: {
      id: true,
      type: true,
      status: true,
      targetUrl: true,
      error: true,
      payload: true,
      scheduledAt: true,
      executedAt: true,
      screenshotPath: true,
      account: { select: { label: true } },
      campaignLead: { select: { firstName: true, lastName: true, linkedinName: true, campaign: { select: { id: true, name: true } } } },
    },
  });
}
export type ActivityRow = Awaited<ReturnType<typeof recentActivity>>[number];

export async function recentReplies(prisma: PrismaClient, workspaceId: string, take = 100) {
  return prisma.inboxMessage.findMany({
    where: { account: { workspaceId } },
    orderBy: { fetchedAt: "desc" },
    take,
    select: { id: true, fromName: true, text: true, fetchedAt: true, account: { select: { label: true } } },
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** Counts for the last 7 days and the 7 days before, for the stat cards. */
export async function weeklyStats(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  const before = new Date(now.getTime() - 14 * DAY);
  const count = (type: "CONNECTION_REQUEST" | "MESSAGE" | "PROFILE_VISIT", from: Date, to: Date) =>
    prisma.action.count({
      where: { account: { workspaceId }, type, status: "SUCCEEDED", executedAt: { gte: from, lt: to } },
    });
  const replies = (from: Date, to: Date) =>
    prisma.inboxMessage.count({ where: { account: { workspaceId }, fetchedAt: { gte: from, lt: to } } });
  const [inv, invPrev, msg, msgPrev, vis, visPrev, rep, repPrev] = await Promise.all([
    count("CONNECTION_REQUEST", since, now),
    count("CONNECTION_REQUEST", before, since),
    count("MESSAGE", since, now),
    count("MESSAGE", before, since),
    count("PROFILE_VISIT", since, now),
    count("PROFILE_VISIT", before, since),
    replies(since, now),
    replies(before, since),
  ]);
  return {
    invites: { now: inv, prev: invPrev },
    messages: { now: msg, prev: msgPrev },
    visits: { now: vis, prev: visPrev },
    replies: { now: rep, prev: repPrev },
  };
}

/** Lightweight list for the sidebar account switcher. */
export async function sidebarAccounts(prisma: PrismaClient, workspaceId: string) {
  return prisma.linkedinAccount.findMany({
    where: { workspaceId },
    orderBy: { label: "asc" },
    select: { id: true, label: true, status: true, profileName: true },
  });
}

export interface WeekTable {
  days: { key: string; label: string }[];
  rows: { label: string; counts: number[]; total: number }[];
}

/** Per-day totals for the last 7 days, in the given time zone (the dashboard's "This week" table). */
export async function weekTable(prisma: PrismaClient, workspaceId: string, timeZone: string, now = new Date()): Promise<WeekTable> {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const label = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric" });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY);
    return { key: fmt.format(d), label: label.format(d) };
  });
  const since = new Date(now.getTime() - 8 * DAY);
  const [actions, accepted, replies] = await Promise.all([
    prisma.$queryRaw<{ d: string; type: string; n: number }[]>`
      SELECT to_char((a.executed_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS d, a.type::text AS type, COUNT(*)::int AS n
      FROM actions a JOIN linkedin_accounts acc ON acc.id = a.account_id
      WHERE acc.workspace_id = ${workspaceId} AND a.status = 'SUCCEEDED' AND a.executed_at >= ${since}
        AND a.type IN ('PROFILE_VISIT', 'CONNECTION_REQUEST', 'MESSAGE')
      GROUP BY 1, 2`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char((connected_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
      FROM campaign_leads WHERE workspace_id = ${workspaceId} AND connected_at >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`
      SELECT to_char((m.fetched_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
      FROM inbox_messages m JOIN linkedin_accounts acc ON acc.id = m.account_id
      WHERE acc.workspace_id = ${workspaceId} AND m.fetched_at >= ${since} GROUP BY 1`,
  ]);
  const row = (lbl: string, pick: (d: string) => number) => {
    const counts = days.map((day) => pick(day.key));
    return { label: lbl, counts, total: counts.reduce((a, b) => a + b, 0) };
  };
  const ofType = (t: string) => (d: string) => actions.find((r) => r.d === d && r.type === t)?.n ?? 0;
  const of = (rows: { d: string; n: number }[]) => (d: string) => rows.find((r) => r.d === d)?.n ?? 0;
  return {
    days,
    rows: [
      row("Profile visits", ofType("PROFILE_VISIT")),
      row("Invites sent", ofType("CONNECTION_REQUEST")),
      row("Accepted", of(accepted)),
      row("Messages sent", ofType("MESSAGE")),
      row("Replies", of(replies)),
    ],
  };
}
