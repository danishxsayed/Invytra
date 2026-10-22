import type { PrismaClient } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AccountUsage {
  today: { PROFILE_VISIT: number; CONNECTION_REQUEST: number; MESSAGE: number };
  /** Connection requests in the last 7 days. */
  connectionRequestsThisWeek: number;
}

/**
 * Rolling-window usage for limit checks: last 24 h per action type, and last
 * 7 days of connection requests. Rolling windows are stricter than calendar days.
 */
export async function usageFor(prisma: PrismaClient, accountId: string, now = new Date()): Promise<AccountUsage> {
  const [daily, weekly] = await Promise.all([
    prisma.action.groupBy({
      by: ["type"],
      where: { accountId, status: "SUCCEEDED", executedAt: { gte: new Date(now.getTime() - DAY_MS) } },
      _count: { _all: true },
    }),
    prisma.action.count({
      where: {
        accountId,
        type: "CONNECTION_REQUEST",
        status: "SUCCEEDED",
        executedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
      },
    }),
  ]);
  const count = (t: string) => daily.find((d) => d.type === t)?._count._all ?? 0;
  return {
    today: {
      PROFILE_VISIT: count("PROFILE_VISIT"),
      CONNECTION_REQUEST: count("CONNECTION_REQUEST"),
      MESSAGE: count("MESSAGE"),
    },
    connectionRequestsThisWeek: weekly,
  };
}
