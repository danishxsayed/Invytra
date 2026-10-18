import type { Prisma, PrismaClient } from "@invytra/db";
import {
  DEFAULT_LIMITS,
  DEFAULT_WORKING_HOURS,
  canExecute,
  limitsSchema,
  workingHoursSchema,
  type ActionType,
  type UsageCounts,
  type WorkingHours,
} from "@invytra/shared";
import { AccountNeedsAttentionError, evidenceOf } from "../browser/errors.js";
import { withAccountSession, type SessionManagerDeps } from "../browser/session-manager.js";
import type { SessionTaskContext } from "../browser/types.js";
import { InviteLimitReachedError, type ActionOutcome } from "../linkedin/actions.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALWAYS: WorkingHours = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 };

export interface RunActionInput {
  accountId: string;
  type: ActionType;
  targetUrl?: string;
  payload?: Record<string, unknown>;
  /** DEV ONLY — skip the working-hours check. Daily/weekly limits still apply. */
  ignoreWorkingHours?: boolean;
}

export type RunActionResult<T> =
  | { status: "SUCCEEDED"; actionId: string; data: T; durationMs: number }
  | { status: "SKIPPED"; actionId: string; reason: string; data?: T }
  /** screenshotPath: the screenshot for account stops, or the evidence folder for other failures. */
  | { status: "FAILED"; actionId: string; error: string; screenshotPath: string | null };

/**
 * Rolling-window usage for limit checks: last 24 h per action type, and last
 * 7 days of connection requests. Rolling windows are stricter than calendar days.
 */
export async function usageFor(prisma: PrismaClient, accountId: string, now = new Date()): Promise<UsageCounts> {
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
  const count = (t: ActionType) => daily.find((d) => d.type === t)?._count._all ?? 0;
  return {
    today: {
      PROFILE_VISIT: count("PROFILE_VISIT"),
      CONNECTION_REQUEST: count("CONNECTION_REQUEST"),
      MESSAGE: count("MESSAGE"),
    },
    connectionRequestsThisWeek: weekly,
  };
}

/**
 * Checks limits and working hours BEFORE touching LinkedIn (CLAUDE.md rule 4),
 * runs the action inside a session, and logs it in the `actions` table (rule 9).
 */
export async function runAction<T>(
  prisma: PrismaClient,
  deps: SessionManagerDeps,
  input: RunActionInput,
  work: (ctx: SessionTaskContext) => Promise<ActionOutcome<T>>,
): Promise<RunActionResult<T>> {
  const account = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: input.accountId } });
  const limits = limitsSchema.safeParse(account.limits).data ?? DEFAULT_LIMITS;
  const hours = workingHoursSchema.safeParse(account.workingHours).data ?? DEFAULT_WORKING_HOURS;

  const now = new Date();
  const decision = canExecute(
    input.type,
    {
      status: account.status,
      timeZone: account.timezone,
      workingHours: input.ignoreWorkingHours ? ALWAYS : hours,
      limits,
    },
    await usageFor(prisma, account.id, now),
    now,
  );

  const base = {
    accountId: account.id,
    type: input.type,
    targetUrl: input.targetUrl ?? null,
    payload: (input.payload ?? {}) as Prisma.InputJsonValue,
  };

  if (!decision.allowed) {
    const skipped = await prisma.action.create({
      data: { ...base, status: "SKIPPED", error: decision.reason, executedAt: now },
    });
    return { status: "SKIPPED", actionId: skipped.id, reason: decision.reason };
  }

  const action = await prisma.action.create({ data: { ...base, status: "RUNNING", attempts: 1 } });
  const started = Date.now();
  try {
    const outcome = await withAccountSession(account.id, work, deps);
    const durationMs = Date.now() - started;
    const result = (outcome.data ?? null) as Prisma.InputJsonValue;
    if (outcome.outcome === "SKIPPED") {
      await prisma.action.update({
        where: { id: action.id },
        data: {
          status: "SKIPPED",
          error: outcome.reason,
          executedAt: new Date(),
          durationMs,
          payload: { ...(input.payload ?? {}), result } as Prisma.InputJsonValue,
        },
      });
      return { status: "SKIPPED", actionId: action.id, reason: outcome.reason, data: outcome.data };
    }
    await prisma.action.update({
      where: { id: action.id },
      data: {
        status: "SUCCEEDED",
        executedAt: new Date(),
        durationMs,
        payload: { ...(input.payload ?? {}), result } as Prisma.InputJsonValue,
      },
    });
    return { status: "SUCCEEDED", actionId: action.id, data: outcome.data, durationMs };
  } catch (err) {
    const error =
      err instanceof InviteLimitReachedError
        ? "WEEKLY_INVITE_LIMIT"
        : err instanceof Error
          ? err.message
          : String(err);
    const evidence = evidenceOf(err);
    const screenshotPath =
      err instanceof AccountNeedsAttentionError ? err.screenshotPath : (evidence?.evidenceDir ?? null);
    await prisma.action.update({
      where: { id: action.id },
      data: { status: "FAILED", error, screenshotPath, executedAt: new Date(), durationMs: Date.now() - started },
    });
    return { status: "FAILED", actionId: action.id, error, screenshotPath };
  }
}
