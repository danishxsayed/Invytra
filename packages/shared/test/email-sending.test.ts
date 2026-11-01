import { describe, expect, it } from "vitest";
import { EMAIL_LIMITS, localDayStart, nextSendAfter, nextSendingWindow, waitingText, mailboxReadiness, mailboxSettingsSchema, pickMailbox, type MailboxSendState } from "../src/email-sending.js";

// Monday 2 Nov 2026, 11:00 in Kolkata (05:30 UTC).
const now = new Date("2026-11-02T05:30:00Z");
const box = (o: Partial<MailboxSendState> = {}): MailboxSendState => ({
  id: "a",
  status: "ACTIVE",
  dailyLimit: 30,
  gapMinutes: 6,
  timeZone: "Asia/Kolkata",
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  lastSentAt: null,
  sentToday: 0,
  ...o,
});

describe("email sending rules", () => {
  it("finds local midnight in the mailbox's time zone", () => {
    expect(localDayStart(now, "Asia/Kolkata").toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(localDayStart(now, "UTC").toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(localDayStart(new Date("2026-11-02T03:00:00Z"), "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("says why a mailbox can't send now", () => {
    expect(mailboxReadiness(box(), now)).toEqual({ ok: true });
    expect(mailboxReadiness(box({ status: "PAUSED" }), now)).toMatchObject({ reason: "PAUSED" });
    expect(mailboxReadiness(box({ status: "ERROR" }), now)).toMatchObject({ reason: "ERROR" });
    expect(mailboxReadiness(box({ sentToday: 30 }), now)).toMatchObject({ reason: "DAILY_LIMIT" });
    expect(mailboxReadiness(box({ startHour: 12 }), now)).toMatchObject({ reason: "OUTSIDE_HOURS" });
    expect(mailboxReadiness(box({ days: [6, 7] }), now)).toMatchObject({ reason: "OUTSIDE_HOURS" });
    const r = mailboxReadiness(box({ lastSentAt: new Date(now.getTime() - 2 * 60_000) }), now);
    expect(r).toEqual({ ok: false, reason: "TOO_SOON", until: new Date(now.getTime() + 4 * 60_000) });
  });

  it("waits for the randomised next send time", () => {
    expect(mailboxReadiness(box({ nextSendAt: new Date(now.getTime() + 60_000) }), now)).toMatchObject({ reason: "TOO_SOON" });
    expect(nextSendAfter(10, now, () => 1).getTime() - now.getTime()).toBe(15 * 60_000);
  });

  it("says when sending hours open next, and why a mailbox waits", () => {
    const sunday = new Date("2026-11-01T10:30:00Z"); // Sun 16:00 Kolkata
    expect(nextSendingWindow(box(), sunday)?.toISOString()).toBe("2026-11-02T03:30:00.000Z"); // Mon 09:00
    expect(nextSendingWindow(box(), now)).toEqual(now);
    expect(waitingText(box(), sunday)).toMatchObject({ reason: "OUTSIDE_HOURS", text: "outside its sending hours; starts again Mon 2 Nov, 09:00 (Asia/Kolkata)" });
    expect(waitingText(box({ sentToday: 30 }), now)).toMatchObject({ reason: "DAILY_LIMIT", text: "sent its 30 emails for today; continues Tue 3 Nov, 09:00" });
    expect(waitingText(box(), now)).toBeNull();
  });

  it("rotates to the ready mailbox that has sent the least", () => {
    const a = box({ id: "a", sentToday: 10 });
    const b = box({ id: "b", sentToday: 4 });
    const c = box({ id: "c", sentToday: 0, status: "PAUSED" });
    const d = box({ id: "d", sentToday: 4, lastSentAt: new Date(now.getTime() - 60 * 60_000) });
    expect(pickMailbox([a, b, c], now)?.id).toBe("b");
    // Same share sent: the one idle longest goes first.
    expect(pickMailbox([d, box({ id: "e", sentToday: 4, lastSentAt: new Date(now.getTime() - 30 * 60_000) })], now)?.id).toBe("d");
    expect(pickMailbox([c], now)).toBeNull();
  });

  it("caps the daily limit and checks the settings", () => {
    const ok = { fromName: "Tom", dailyLimit: 30, gapMinutes: 6, timeZone: "Asia/Kolkata", days: [1, 2], startHour: 9, endHour: 18, signature: "  Tom\nCrawlers  " };
    expect(mailboxSettingsSchema.parse(ok).signature).toBe("Tom\nCrawlers");
    expect(mailboxSettingsSchema.safeParse({ ...ok, dailyLimit: EMAIL_LIMITS.maxDaily + 1 }).success).toBe(false);
    expect(mailboxSettingsSchema.safeParse({ ...ok, timeZone: "Mars/Base" }).success).toBe(false);
    expect(mailboxSettingsSchema.safeParse({ ...ok, startHour: 18, endHour: 9 }).success).toBe(false);
  });
});
