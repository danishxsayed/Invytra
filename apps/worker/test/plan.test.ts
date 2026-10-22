import { DEFAULT_WORKING_HOURS, isWithinWorkingHours } from "@invytra/shared";
import { describe, expect, it } from "vitest";
import { validateSpec, isRetryable } from "../src/actions/registry.js";
import { MAX_ATTEMPTS, busyRetryAt, inviteBlockUntil, notesBlockUntil, pollAgainAt, rescheduleFor, retryAt } from "../src/queue/plan.js";
import { memoryPacingStore } from "../src/queue/pacing.js";

const WED_NIGHT_IST = new Date("2025-10-15T16:00:00Z"); // 21:30 IST
const H = 3600_000;
const mid = () => 0.5;

describe("rescheduleFor", () => {
  it("moves out-of-hours work into the next window, a little after it opens", () => {
    const t = rescheduleFor("OUTSIDE_WORKING_HOURS", WED_NIGHT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS, mid);
    expect(isWithinWorkingHours(t, "Asia/Kolkata", DEFAULT_WORKING_HOURS)).toBe(true);
    const open = new Date("2025-10-16T03:30:00Z").getTime(); // Thu 09:00 IST
    expect(t.getTime()).toBeGreaterThan(open);
    expect(t.getTime()).toBeLessThanOrEqual(open + 25 * 60_000);
  });
  it("re-checks daily limits in 1–2 hours", () => {
    const d = rescheduleFor("DAILY_LIMIT_REACHED", WED_NIGHT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS, mid).getTime() - WED_NIGHT_IST.getTime();
    expect(d).toBeGreaterThanOrEqual(1 * H);
    expect(d).toBeLessThanOrEqual(2 * H);
  });
  it("re-checks weekly limits in ~half a day", () => {
    const d = rescheduleFor("WEEKLY_LIMIT_REACHED", WED_NIGHT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS, mid).getTime() - WED_NIGHT_IST.getTime();
    expect(d).toBeGreaterThanOrEqual(10 * H);
    expect(d).toBeLessThanOrEqual(14 * H);
  });
  it("parks actions of stopped accounts for an hour", () => {
    expect(rescheduleFor("ACCOUNT_NOT_ACTIVE", WED_NIGHT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS).getTime() - WED_NIGHT_IST.getTime()).toBe(H);
  });
});

describe("retry rules", () => {
  it("retries a busy account within minutes", () => {
    const d = busyRetryAt(WED_NIGHT_IST, mid).getTime() - WED_NIGHT_IST.getTime();
    expect(d).toBeGreaterThanOrEqual(60_000);
    expect(d).toBeLessThanOrEqual(180_000);
  });
  it("backs off longer on each attempt", () => {
    expect(retryAt(WED_NIGHT_IST, 2, mid).getTime()).toBeGreaterThan(retryAt(WED_NIGHT_IST, 1, mid).getTime());
  });
  it("allows at most 2 retries", () => expect(MAX_ATTEMPTS).toBe(3));
  it("never auto-retries messages (could double-send)", () => {
    expect(isRetryable("MESSAGE")).toBe(false);
    expect(isRetryable("CONNECTION_REQUEST")).toBe(true);
  });
  it("pauses invites for 3 days after LinkedIn's weekly limit", () =>
    expect(inviteBlockUntil(WED_NIGHT_IST).getTime() - WED_NIGHT_IST.getTime()).toBe(72 * H));
});

describe("validateSpec", () => {
  it("requires a URL for profile actions", () => expect(() => validateSpec({ type: "CONNECTION_REQUEST" })).toThrow(/URL/));
  it("requires text for messages", () =>
    expect(() => validateSpec({ type: "MESSAGE", targetUrl: "https://www.linkedin.com/in/x/", payload: {} })).toThrow(/text/));
  it("accepts an inbox sync with no URL", () => expect(() => validateSpec({ type: "INBOX_SYNC" })).not.toThrow());
  it("refuses a note that still has placeholder text", () =>
    expect(() =>
      validateSpec({ type: "CONNECTION_REQUEST", targetUrl: "https://www.linkedin.com/in/x/", payload: { note: "Hi {firstName}, …" } }),
    ).toThrow(/placeholder/));
});

describe("notesBlockUntil", () => {
  it("lifts on the 1st of next month", () =>
    expect(notesBlockUntil(new Date("2026-10-21T10:00:00Z")).toISOString()).toBe("2026-11-01T06:00:00.000Z"));
  it("rolls over the year", () =>
    expect(notesBlockUntil(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2027-01-01T06:00:00.000Z"));
});

describe("pollAgainAt", () => {
  it("polls within 2 minutes when the slot is held for longer", () => {
    const t = pollAgainAt(WED_NIGHT_IST, new Date(WED_NIGHT_IST.getTime() + 15 * 60_000), mid).getTime();
    expect(t - WED_NIGHT_IST.getTime()).toBeLessThanOrEqual(120_000);
  });
  it("comes back right when a short gap ends", () => {
    const end = new Date(WED_NIGHT_IST.getTime() + 20_000);
    expect(pollAgainAt(WED_NIGHT_IST, end, mid)).toEqual(end);
  });
});

describe("memoryPacingStore", () => {
  it("lets only one job claim an account slot", async () => {
    const p = memoryPacingStore();
    const hold = new Date(WED_NIGHT_IST.getTime() + 15 * 60_000);
    expect(await p.claim("a", WED_NIGHT_IST, hold)).toBeNull();
    expect(await p.claim("a", WED_NIGHT_IST, hold)).toEqual(hold);
    expect(await p.claim("b", WED_NIGHT_IST, hold)).toBeNull();
  });
  it("stores per account and key", async () => {
    const p = memoryPacingStore();
    await p.set("a", "nextActionAt", WED_NIGHT_IST);
    expect(await p.get("a", "nextActionAt")).toEqual(WED_NIGHT_IST);
    expect(await p.get("a", "inviteBlockedUntil")).toBeNull();
    expect(await p.get("b", "nextActionAt")).toBeNull();
  });
});
