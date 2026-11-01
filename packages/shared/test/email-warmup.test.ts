import { describe, expect, it } from "vitest";
import { EMAIL_WARMUP, inboxRate, pickWarmupPartner, emailWarmupDay, emailWarmupDue, emailWarmupTarget, type WarmupState } from "../src/email-warmup.js";

const now = new Date("2026-11-02T05:30:00Z"); // Mon 11:00 Kolkata
const started = new Date("2026-10-28T10:00:00Z"); // Wed 28 Oct, 15:30 Kolkata → today is day 6
const st = (o: Partial<WarmupState> = {}): WarmupState => ({
  status: "ACTIVE",
  warmupEnabled: true,
  warmupStartedAt: started,
  warmupMaxDaily: 20,
  timeZone: "Asia/Kolkata",
  sendDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
  lastWarmupAt: null,
  warmupSentToday: 0,
  ...o,
});

describe("warm-up rules", () => {
  it("ramps 2 a day up to the maximum", () => {
    expect(emailWarmupDay(started, now, "Asia/Kolkata")).toBe(6);
    expect(emailWarmupTarget(started, 20, now, "Asia/Kolkata")).toBe(12);
    expect(emailWarmupTarget(started, 8, now, "Asia/Kolkata")).toBe(8);
    expect(emailWarmupTarget(now, 20, now, "Asia/Kolkata")).toBe(EMAIL_WARMUP.startDaily);
  });

  it("sends only when on, active, in hours, under target and spread out", () => {
    expect(emailWarmupDue(st(), now)).toBe(true);
    expect(emailWarmupDue(st({ warmupEnabled: false }), now)).toBe(false);
    expect(emailWarmupDue(st({ status: "PAUSED" }), now)).toBe(false);
    expect(emailWarmupDue(st({ startHour: 12 }), now)).toBe(false);
    expect(emailWarmupDue(st({ warmupSentToday: 12 }), now)).toBe(false);
    // 12 a day over 9 hours = one every 45 minutes.
    expect(emailWarmupDue(st({ lastWarmupAt: new Date(now.getTime() - 30 * 60_000) }), now)).toBe(false);
    expect(emailWarmupDue(st({ lastWarmupAt: new Date(now.getTime() - 46 * 60_000) }), now)).toBe(true);
  });

  it("picks a partner on another domain when it can", () => {
    const a = { id: "a", email: "tom@x.pro" };
    const b = { id: "b", email: "sam@x.pro" };
    const c = { id: "c", email: "jo@gmail.com" };
    expect(pickWarmupPartner(a, [a, b, c], () => 0.9)?.id).toBe("c");
    expect(pickWarmupPartner(a, [a, b])?.id).toBe("b");
    expect(pickWarmupPartner(a, [a])).toBeNull();
  });

  it("scores the inbox rate", () => {
    expect(inboxRate({ inbox: 9, spam: 1, missing: 0 })).toBe(90);
    expect(inboxRate({ inbox: 0, spam: 0, missing: 0 })).toBeNull();
  });
});
