import { isLimitedAction, type ActionType } from "./actions.js";
import { ACTION_DELAY_SECONDS, type Limits } from "./limits.js";
import { isWithinWorkingHours, type WorkingHours } from "./working-hours.js";

/** Counts of actions already executed for one account. */
export interface UsageCounts {
  today: { PROFILE_VISIT: number; CONNECTION_REQUEST: number; MESSAGE: number };
  /** Connection requests in the last 7 days. */
  connectionRequestsThisWeek: number;
}

export interface AccountPolicyInput {
  status: "ACTIVE" | "PAUSED" | "NEEDS_ATTENTION" | "DISCONNECTED";
  timeZone: string;
  workingHours: WorkingHours;
  limits: Limits;
}

export type PolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ACCOUNT_NOT_ACTIVE" | "OUTSIDE_WORKING_HOURS" | "DAILY_LIMIT_REACHED" | "WEEKLY_LIMIT_REACHED";
    };

/**
 * Decide whether an action may run now. Called by the worker BEFORE executing
 * a job — never after (CLAUDE.md rule 4).
 */
export function canExecute(
  type: ActionType,
  account: AccountPolicyInput,
  usage: UsageCounts,
  now: Date = new Date(),
): PolicyDecision {
  if (account.status !== "ACTIVE") return { allowed: false, reason: "ACCOUNT_NOT_ACTIVE" };
  if (!isWithinWorkingHours(now, account.timeZone, account.workingHours)) {
    return { allowed: false, reason: "OUTSIDE_WORKING_HOURS" };
  }
  if (!isLimitedAction(type)) return { allowed: true };

  const { limits } = account;
  const dailyCap = {
    PROFILE_VISIT: limits.profileVisitsPerDay,
    CONNECTION_REQUEST: limits.connectionRequestsPerDay,
    MESSAGE: limits.messagesPerDay,
  }[type];
  if (usage.today[type] >= dailyCap) return { allowed: false, reason: "DAILY_LIMIT_REACHED" };

  if (type === "CONNECTION_REQUEST" && usage.connectionRequestsThisWeek >= limits.connectionRequestsPerWeek) {
    return { allowed: false, reason: "WEEKLY_LIMIT_REACHED" };
  }
  return { allowed: true };
}

/** Random, non-uniform-looking delay in ms between two actions on one account. */
export function randomActionDelayMs(random: () => number = Math.random): number {
  const { min, max } = ACTION_DELAY_SECONDS;
  // Average of two uniforms → values cluster mid-range like human pacing.
  const r = (random() + random()) / 2;
  return Math.round((min + r * (max - min)) * 1000);
}
