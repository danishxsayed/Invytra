import type { Limits } from "./limits.js";

/** New accounts ramp up over this many days. */
export const WARMUP_DAYS = 14;
/** On a varied day the caps land between this share of the limit and the full limit. */
export const DAILY_VARIATION_FLOOR = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyLimitContext {
  accountId: string;
  timeZone: string;
  /** End of the warm-up period, or null when the account does not warm up. */
  warmupUntil: Date | null;
  now?: Date;
}

/** Which warm-up day the account is on (1-based), or null when not warming up. */
export function warmupDay(warmupUntil: Date | null, now = new Date()): number | null {
  if (!warmupUntil || now >= warmupUntil) return null;
  const start = warmupUntil.getTime() - WARMUP_DAYS * DAY_MS;
  return Math.min(WARMUP_DAYS, Math.max(1, Math.floor((now.getTime() - start) / DAY_MS) + 1));
}

/** Calendar date (YYYY-MM-DD) in the account's own time zone. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Stable number in [0, 1) for a string (FNV-1a) — the same account and day always vary the same way. */
function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/**
 * Today's actual caps for an account: the configured limits, scaled down while
 * a new account warms up, then varied per day so the totals never form a pattern.
 * Weekly invites are not varied — they are already a hard ceiling.
 */
export function effectiveLimits(limits: Limits, ctx: DailyLimitContext): Limits {
  const now = ctx.now ?? new Date();
  const day = warmupDay(ctx.warmupUntil, now);
  // Warm-up: day 1 runs at ~30% of the limits, reaching 100% after WARMUP_DAYS.
  const warm = day === null ? 1 : 0.3 + 0.7 * ((day - 1) / WARMUP_DAYS);
  const date = localDate(now, ctx.timeZone);

  const cap = (value: number, key: string, minimum: number) => {
    if (value <= 0) return 0;
    let v = value * warm;
    if (limits.randomizeDaily) {
      v *= DAILY_VARIATION_FLOOR + (1 - DAILY_VARIATION_FLOOR) * unitHash(`${ctx.accountId}:${date}:${key}`);
    }
    return Math.min(value, Math.max(minimum, Math.round(v)));
  };

  return {
    ...limits,
    connectionRequestsPerDay: cap(limits.connectionRequestsPerDay, "invites", 2),
    messagesPerDay: cap(limits.messagesPerDay, "messages", 5),
    profileVisitsPerDay: cap(limits.profileVisitsPerDay, "visits", 5),
  };
}

/** Warm-up end date for an account connected now. */
export function warmupEndFrom(now = new Date()): Date {
  return new Date(now.getTime() + WARMUP_DAYS * DAY_MS);
}
