import { z } from "zod";
import { localDayStart } from "./email-sending.js";
import { localTime } from "./working-hours.js";

/*
 * Warm-up: mailboxes in the warm-up pool email each other a few times a day, more each
 * day; the receiving side opens them, rescues them from spam and sometimes replies. That
 * builds the domain's sending reputation before (and while) it sends cold email.
 */

export const EMAIL_WARMUP = {
  /** Warm-up emails on day 1, and how many more each day after. */
  startDaily: 2,
  stepDaily: 2,
  defaultMaxDaily: 20,
  maxMaxDaily: 40,
  defaultReplyRate: 30,
  /** Never two warm-up emails from one mailbox closer than this. */
  minGapMinutes: 10,
  /** Look for a warm-up email in the partner's mailbox only after this long… */
  checkAfterMinutes: 5,
  /** …and call it missing (neither inbox nor spam) after this long. */
  missingAfterHours: 24,
  /** Days of warm-up before cold email is recommended. */
  readyAfterDays: 14,
  /** Inbox rate (%) considered healthy. */
  healthyInboxRate: 90,
} as const;

export const warmupSettingsSchema = z.object({
  enabled: z.boolean(),
  maxDaily: z.number().int().min(5, "At least 5 warm-up emails a day.").max(EMAIL_WARMUP.maxMaxDaily, `At most ${EMAIL_WARMUP.maxMaxDaily} warm-up emails a day.`),
  replyRate: z.number().int().min(0).max(80, "Reply to at most 80% of warm-up emails."),
});
export type WarmupSettings = z.infer<typeof warmupSettingsSchema>;

/** Which day of warm-up this is (1 = the day it started), in the mailbox's time zone. */
export function emailWarmupDay(startedAt: Date, now: Date, timeZone: string): number {
  const start = localDayStart(startedAt, timeZone).getTime();
  const today = localDayStart(now, timeZone).getTime();
  return Math.max(1, Math.round((today - start) / 86_400_000) + 1);
}

/** Today's warm-up target: 2 on day 1, +2 a day, up to the mailbox's maximum. */
export function emailWarmupTarget(startedAt: Date, maxDaily: number, now: Date, timeZone: string): number {
  return Math.min(maxDaily, EMAIL_WARMUP.startDaily + EMAIL_WARMUP.stepDaily * (emailWarmupDay(startedAt, now, timeZone) - 1));
}

export interface WarmupState {
  status: "ACTIVE" | "ERROR" | "PAUSED";
  warmupEnabled: boolean;
  warmupStartedAt: Date | null;
  warmupMaxDaily: number;
  timeZone: string;
  sendDays: number[];
  startHour: number;
  endHour: number;
  lastWarmupAt: Date | null;
  /** Warm-up emails it sent today (its own time zone). */
  warmupSentToday: number;
}

/** Whether a mailbox should send a warm-up email now: in its hours, under today's target, spread evenly. */
export function emailWarmupDue(m: WarmupState, now: Date): boolean {
  if (!m.warmupEnabled || !m.warmupStartedAt || m.status !== "ACTIVE") return false;
  const { weekday, hour } = localTime(now, m.timeZone);
  if (!m.sendDays.includes(weekday) || hour < m.startHour || hour >= m.endHour) return false;
  const target = emailWarmupTarget(m.warmupStartedAt, m.warmupMaxDaily, now, m.timeZone);
  if (m.warmupSentToday >= target) return false;
  // Spread today's target over the sending hours.
  const gapMin = Math.max(EMAIL_WARMUP.minGapMinutes, ((m.endHour - m.startHour) * 60) / target);
  return !m.lastWarmupAt || now.getTime() - m.lastWarmupAt.getTime() >= gapMin * 60_000;
}

/** A warm-up partner: another pool mailbox, preferably on a different domain. */
export function pickWarmupPartner<T extends { id: string; email: string }>(from: T, pool: readonly T[], rand: () => number = Math.random): T | null {
  const domain = (e: string) => e.slice(e.lastIndexOf("@") + 1);
  const others = pool.filter((p) => p.id !== from.id);
  const elsewhere = others.filter((p) => domain(p.email) !== domain(from.email));
  const list = elsewhere.length ? elsewhere : others;
  return list.length ? list[Math.floor(rand() * list.length)]! : null;
}

/** % of checked warm-up emails that landed in the inbox (null until some were checked). */
export function inboxRate(landed: { inbox: number; spam: number; missing: number }): number | null {
  const total = landed.inbox + landed.spam + landed.missing;
  return total ? Math.round((landed.inbox / total) * 100) : null;
}
