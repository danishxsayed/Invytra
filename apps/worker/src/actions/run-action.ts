import { usageFor, type Action, type LinkedinAccount, type Prisma, type PrismaClient } from "@invytra/db";
import {
  DEFAULT_LIMITS,
  DEFAULT_WORKING_HOURS,
  canExecute,
  limitsSchema,
  workingHoursSchema,
  type ActionType,
  type Limits,
  type PolicyDecision,
  type WorkingHours,
} from "@invytra/shared";
import {
  AccountBusyError,
  AccountNeedsAttentionError,
  AccountUnavailableError,
  SessionRequiredError,
  evidenceOf,
} from "../browser/errors.js";
import { withAccountSession, type SessionManagerDeps } from "../browser/session-manager.js";
import type { SessionTaskContext } from "../browser/types.js";
import { InviteLimitReachedError, type ActionOutcome } from "../linkedin/actions.js";
import { afterSuccess } from "./registry.js";

export const ALWAYS: WorkingHours = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 };

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
  | { status: "FAILED"; actionId: string; error: string; screenshotPath: string | null; errorKind: FailureKind };

/** Why an action failed — decides whether it may be retried. */
export type FailureKind = "ACCOUNT_STOPPED" | "INVITE_LIMIT" | "BUSY" | "OTHER";

export { usageFor } from "@invytra/db";

export function accountSettings(account: LinkedinAccount): { limits: Limits; hours: WorkingHours } {
  return {
    limits: limitsSchema.safeParse(account.limits).data ?? DEFAULT_LIMITS,
    hours: workingHoursSchema.safeParse(account.workingHours).data ?? DEFAULT_WORKING_HOURS,
  };
}

/** Limits + working hours + account status, checked BEFORE touching LinkedIn (CLAUDE.md rule 4). */
export async function checkPolicy(
  prisma: PrismaClient,
  account: LinkedinAccount,
  type: ActionType,
  now: Date,
  ignoreWorkingHours = false,
): Promise<PolicyDecision> {
  const { limits, hours } = accountSettings(account);
  return canExecute(
    type,
    { status: account.status, timeZone: account.timezone, workingHours: ignoreWorkingHours ? ALWAYS : hours, limits },
    await usageFor(prisma, account.id, now),
    now,
  );
}

/**
 * Runs an existing Action row inside a session and records the outcome on it
 * (CLAUDE.md rule 9). The caller has already checked policy.
 */
export async function executeActionRow<T>(
  prisma: PrismaClient,
  deps: SessionManagerDeps,
  action: Action,
  work: (ctx: SessionTaskContext) => Promise<ActionOutcome<T>>,
): Promise<RunActionResult<T>> {
  const input = (action.payload ?? {}) as Record<string, unknown>;
  await prisma.action.update({
    where: { id: action.id },
    data: { status: "RUNNING", attempts: { increment: 1 }, error: null },
  });
  const started = Date.now();
  try {
    const outcome = await withAccountSession(action.accountId, work, deps);
    const durationMs = Date.now() - started;
    if (outcome.outcome === "SKIPPED") {
      await prisma.action.update({
        where: { id: action.id },
        data: {
          status: "SKIPPED",
          error: outcome.reason,
          executedAt: new Date(),
          durationMs,
          payload: { ...input, result: (outcome.data ?? null) as Prisma.InputJsonValue } as Prisma.InputJsonValue,
        },
      });
      return { status: "SKIPPED", actionId: action.id, reason: outcome.reason, data: outcome.data };
    }
    const extra = await afterSuccess(prisma, action.accountId, action.type, outcome.data);
    await prisma.action.update({
      where: { id: action.id },
      data: {
        status: "SUCCEEDED",
        executedAt: new Date(),
        durationMs,
        payload: { ...input, result: { ...(outcome.data as object), ...extra } } as Prisma.InputJsonValue,
      },
    });
    return { status: "SUCCEEDED", actionId: action.id, data: { ...(outcome.data as object), ...extra } as T, durationMs };
  } catch (err) {
    const errorKind: FailureKind =
      err instanceof AccountNeedsAttentionError ||
      err instanceof SessionRequiredError ||
      err instanceof AccountUnavailableError
        ? "ACCOUNT_STOPPED"
        : err instanceof AccountBusyError
          ? "BUSY"
          : err instanceof InviteLimitReachedError
          ? "INVITE_LIMIT"
          : "OTHER";
    const error =
      errorKind === "INVITE_LIMIT" ? "WEEKLY_INVITE_LIMIT" : err instanceof Error ? err.message : String(err);
    const evidence = evidenceOf(err);
    const screenshotPath =
      err instanceof AccountNeedsAttentionError ? err.screenshotPath : (evidence?.evidenceDir ?? null);
    await prisma.action.update({
      where: { id: action.id },
      data: { status: "FAILED", error, screenshotPath, executedAt: new Date(), durationMs: Date.now() - started },
    });
    return { status: "FAILED", actionId: action.id, error, screenshotPath, errorKind };
  }
}

/** Run one action right now (CLI / dev): log it, check policy, execute. */
export async function runAction<T>(
  prisma: PrismaClient,
  deps: SessionManagerDeps,
  input: RunActionInput,
  work: (ctx: SessionTaskContext) => Promise<ActionOutcome<T>>,
): Promise<RunActionResult<T>> {
  const account = await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: input.accountId } });
  const now = new Date();
  const decision = await checkPolicy(prisma, account, input.type, now, input.ignoreWorkingHours);
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
  const action = await prisma.action.create({ data: { ...base, status: "QUEUED" } });
  return executeActionRow(prisma, deps, action, work);
}
