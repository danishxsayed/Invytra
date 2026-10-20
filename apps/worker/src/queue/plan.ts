import { nextWorkingWindowStart, type PolicyDecision, type WorkingHours } from "@invytra/shared";

export type Random = () => number;
const MIN = 60_000;
const between = (min: number, max: number, random: Random) => Math.round(min + random() * (max - min));

/**
 * When a queued action may not run now, decide when to look at it again.
 * Re-checks are cheap (no LinkedIn access) — the policy is evaluated again then.
 */
export function rescheduleFor(
  reason: Exclude<PolicyDecision, { allowed: true }>["reason"],
  now: Date,
  timeZone: string,
  hours: WorkingHours,
  random: Random = Math.random,
): Date {
  switch (reason) {
    case "OUTSIDE_WORKING_HOURS":
      // Next window opens, plus up to 25 min so accounts don't all start on the hour.
      return new Date(nextWorkingWindowStart(now, timeZone, hours).getTime() + between(1, 25, random) * MIN);
    case "DAILY_LIMIT_REACHED":
      // Rolling 24 h window frees up gradually; look again in 1–2 h.
      return new Date(now.getTime() + between(60, 120, random) * MIN);
    case "WEEKLY_LIMIT_REACHED":
      return new Date(now.getTime() + between(10, 14, random) * 60 * MIN);
    case "ACCOUNT_NOT_ACTIVE":
      // Parked until a person reactivates the account.
      return new Date(now.getTime() + 60 * MIN);
  }
}

/** Another worker holds the account — try again shortly. */
export function busyRetryAt(now: Date, random: Random = Math.random): Date {
  return new Date(now.getTime() + between(1, 3, random) * MIN);
}

export const MAX_ATTEMPTS = 3;

/** Back-off for a retryable failure: 15–30 min, longer each attempt. */
export function retryAt(now: Date, attempt: number, random: Random = Math.random): Date {
  return new Date(now.getTime() + attempt * between(15, 30, random) * MIN);
}

/** After LinkedIn's weekly invite limit: no invites from this account for 3 days. */
export function inviteBlockUntil(now: Date): Date {
  return new Date(now.getTime() + 3 * 24 * 60 * MIN);
}

/** How long a running action holds its account's slot at most (released early when it finishes). */
export const CLAIM_HOLD_MS = 15 * MIN;

/** A job that isn't its account's turn yet: look again soon (cheap, no LinkedIn access). */
export function pollAgainAt(now: Date, notBefore: Date | null, random: Random = Math.random): Date {
  const poll = now.getTime() + between(45, 120, random) * 1000;
  return new Date(notBefore ? Math.min(Math.max(notBefore.getTime(), now.getTime() + 5000), poll) : poll);
}
