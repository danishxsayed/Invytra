import { z } from "zod";
import { localTime } from "./working-hours.js";

/*
 * Email Outreach sending rules: how much each mailbox may send, when, and which mailbox
 * sends next (rotation). Pure, so the dashboard and the sender share one set of rules.
 */

export const EMAIL_LIMITS = {
  /** A new mailbox's daily limit. */
  defaultDaily: 30,
  /** The most a mailbox may send a day: more than this lands cold email in spam. */
  maxDaily: 50,
  /** Minutes between two emails from one mailbox. */
  defaultGapMinutes: 6,
  minGapMinutes: 2,
  maxGapMinutes: 60,
} as const;

/** Every common IANA zone name is accepted; Intl checks it. */
export const timeZoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Choose a valid time zone.");

export const mailboxSettingsSchema = z
  .object({
    fromName: z.string().trim().min(1, "Enter the sender name.").max(80),
    dailyLimit: z.number().int().min(1, "Send at least 1 email a day.").max(EMAIL_LIMITS.maxDaily, `At most ${EMAIL_LIMITS.maxDaily} emails a day per mailbox: more lands in spam.`),
    gapMinutes: z.number().int().min(EMAIL_LIMITS.minGapMinutes, `Wait at least ${EMAIL_LIMITS.minGapMinutes} minutes between emails.`).max(EMAIL_LIMITS.maxGapMinutes),
    timeZone: timeZoneSchema,
    days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one sending day."),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    signature: z.string().max(2000).transform((s) => s.trim()),
  })
  .refine((s) => s.endHour > s.startHour, { message: "The end time must be after the start time.", path: ["endHour"] });
export type MailboxSettings = z.infer<typeof mailboxSettingsSchema>;

export interface MailboxSendState {
  id: string;
  status: "ACTIVE" | "ERROR" | "PAUSED";
  dailyLimit: number;
  gapMinutes: number;
  timeZone: string;
  days: number[];
  startHour: number;
  endHour: number;
  lastSentAt: Date | null;
  /** Campaign sending waits until this moment (the gap plus a random extra). */
  nextSendAt?: Date | null;
  /** Emails sent since the start of today in the mailbox's time zone. */
  sentToday: number;
}

export type NotReady = "PAUSED" | "ERROR" | "DAILY_LIMIT" | "OUTSIDE_HOURS" | "TOO_SOON";
export type Readiness = { ok: true } | { ok: false; reason: NotReady; until?: Date };

export const NOT_READY_TEXT: Record<NotReady, string> = {
  PAUSED: "Paused",
  ERROR: "Needs attention",
  DAILY_LIMIT: "Today's limit reached",
  OUTSIDE_HOURS: "Outside sending hours",
  TOO_SOON: "Waiting between emails",
};

function wallParts(at: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
      .formatToParts(at)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, Number(x.value)]),
  );
}
/** How far a time zone's clock is ahead of UTC at an instant, in ms. */
function offsetAt(at: Date, timeZone: string): number {
  const p = wallParts(at, timeZone);
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant today began (local midnight) in a time zone, daylight-saving safe. */
export function localDayStart(now: Date, timeZone: string): Date {
  const p = wallParts(now, timeZone);
  const midnight = Date.UTC(p.year!, p.month! - 1, p.day!);
  const guess = midnight - offsetAt(now, timeZone);
  return new Date(midnight - offsetAt(new Date(guess), timeZone));
}

/** Whether a mailbox may send a campaign email right now, and if not, why. */
export function mailboxReadiness(m: MailboxSendState, now: Date): Readiness {
  if (m.status === "PAUSED") return { ok: false, reason: "PAUSED" };
  if (m.status === "ERROR") return { ok: false, reason: "ERROR" };
  if (m.sentToday >= m.dailyLimit) return { ok: false, reason: "DAILY_LIMIT" };
  const { weekday, hour } = localTime(now, m.timeZone);
  if (!m.days.includes(weekday) || hour < m.startHour || hour >= m.endHour) return { ok: false, reason: "OUTSIDE_HOURS" };
  if (m.nextSendAt && m.nextSendAt > now) return { ok: false, reason: "TOO_SOON", until: m.nextSendAt };
  if (m.lastSentAt) {
    const next = new Date(m.lastSentAt.getTime() + m.gapMinutes * 60_000);
    if (next > now) return { ok: false, reason: "TOO_SOON", until: next };
  }
  return { ok: true };
}

/**
 * Rotation: of the mailboxes ready now, the one that has sent the least today (then the
 * one that sent longest ago), so volume spreads evenly across a campaign's mailboxes.
 */
/** When a mailbox may send its next campaign email: the gap plus up to 50% at random, so sends never look clockwork. */
export function nextSendAfter(gapMinutes: number, now: Date, rand: () => number = Math.random): Date {
  return new Date(now.getTime() + gapMinutes * 60_000 * (1 + 0.5 * rand()));
}

export function pickMailbox<T extends MailboxSendState>(mailboxes: readonly T[], now: Date): T | null {
  const ready = mailboxes.filter((m) => mailboxReadiness(m, now).ok);
  ready.sort((a, b) => a.sentToday / a.dailyLimit - b.sentToday / b.dailyLimit || (a.lastSentAt?.getTime() ?? 0) - (b.lastSentAt?.getTime() ?? 0));
  return ready[0] ?? null;
}
