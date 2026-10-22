import { usageFor, type PrismaClient } from "@invytra/db";
import { DEFAULT_LIMITS, DEFAULT_WORKING_HOURS, limitsSchema, workingHoursSchema } from "@invytra/shared";

/*
 * Every function here takes the workspace id FIRST and filters by it.
 * Pages must pass the id from the signed-in session — never from the URL.
 */

export async function accountsOverview(prisma: PrismaClient, workspaceId: string) {
  const accounts = await prisma.linkedinAccount.findMany({
    where: { workspaceId },
    orderBy: { label: "asc" },
    select: { id: true, label: true, status: true, statusReason: true, timezone: true, limits: true, workingHours: true, lastActiveAt: true },
  });
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
      return {
        id: a.id,
        label: a.label,
        status: a.status,
        statusReason: a.statusReason,
        timezone: a.timezone,
        lastActiveAt: a.lastActiveAt,
        limits: limitsSchema.safeParse(a.limits).data ?? DEFAULT_LIMITS,
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
  take?: number;
}

export async function recentActivity(prisma: PrismaClient, workspaceId: string, filter: ActivityFilter = {}) {
  return prisma.action.findMany({
    where: {
      account: { workspaceId },
      ...(filter.status
        ? filter.status === "QUEUED"
          ? { status: { in: ["QUEUED", "RUNNING"] } }
          : { status: filter.status }
        : {}),
    },
    orderBy: [{ executedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: filter.take ?? 100,
    select: {
      id: true,
      type: true,
      status: true,
      targetUrl: true,
      error: true,
      payload: true,
      scheduledAt: true,
      executedAt: true,
      account: { select: { label: true } },
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
    select: { id: true, label: true, status: true },
  });
}
