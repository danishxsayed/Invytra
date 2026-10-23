import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, effectiveLimits, limitsSchema, localDate, warmupDay, warmupEndFrom, WARMUP_DAYS } from "../src/index.js";

const now = new Date("2026-10-23T06:00:00Z");
const base = { accountId: "acc1", timeZone: "Asia/Kolkata", warmupUntil: null, now };

describe("effectiveLimits", () => {
  it("keeps the exact limits when variation is off and there is no warm-up", () => {
    const l = { ...DEFAULT_LIMITS, randomizeDaily: false };
    expect(effectiveLimits(l, base)).toEqual(l);
  });

  it("varies daily caps between 80% and 100% of the limit, the same all day", () => {
    const a = effectiveLimits(DEFAULT_LIMITS, base);
    expect(a.connectionRequestsPerDay).toBeGreaterThanOrEqual(16);
    expect(a.connectionRequestsPerDay).toBeLessThanOrEqual(20);
    expect(effectiveLimits(DEFAULT_LIMITS, { ...base, now: new Date("2026-10-23T12:00:00Z") })).toEqual(a);
    expect(a.connectionRequestsPerWeek).toBe(DEFAULT_LIMITS.connectionRequestsPerWeek);
  });

  it("gives different days different caps", () => {
    const caps = new Set<number>();
    for (let d = 0; d < 20; d++) {
      caps.add(effectiveLimits(DEFAULT_LIMITS, { ...base, now: new Date(now.getTime() + d * 86400000) }).profileVisitsPerDay);
    }
    expect(caps.size).toBeGreaterThan(3);
  });

  it("ramps up during warm-up and never exceeds the limit", () => {
    const l = { ...DEFAULT_LIMITS, randomizeDaily: false };
    const until = warmupEndFrom(now);
    const day1 = effectiveLimits(l, { ...base, warmupUntil: until });
    expect(day1.connectionRequestsPerDay).toBe(6); // 30% of 20
    const late = effectiveLimits(l, { ...base, warmupUntil: until, now: new Date(until.getTime() - 3600_000) });
    expect(late.connectionRequestsPerDay).toBeGreaterThan(day1.connectionRequestsPerDay);
    expect(late.connectionRequestsPerDay).toBeLessThanOrEqual(20);
    const after = effectiveLimits(l, { ...base, warmupUntil: until, now: new Date(until.getTime() + 1) });
    expect(after.connectionRequestsPerDay).toBe(20);
  });

  it("keeps zero as zero (an action type switched off)", () => {
    expect(effectiveLimits({ ...DEFAULT_LIMITS, messagesPerDay: 0 }, base).messagesPerDay).toBe(0);
  });
});

describe("warm-up helpers", () => {
  it("counts warm-up days from 1 to WARMUP_DAYS", () => {
    const until = warmupEndFrom(now);
    expect(warmupDay(until, now)).toBe(1);
    expect(warmupDay(until, new Date(until.getTime() - 1000))).toBe(WARMUP_DAYS);
    expect(warmupDay(until, until)).toBeNull();
    expect(warmupDay(null, now)).toBeNull();
  });
  it("uses the account's own calendar date", () => {
    expect(localDate(new Date("2026-10-22T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-23");
    expect(localDate(new Date("2026-10-22T20:00:00Z"), "America/New_York")).toBe("2026-10-22");
  });
  it("treats stored limits without the new switch as varied", () => {
    const { randomizeDaily, ...old } = DEFAULT_LIMITS;
    expect(limitsSchema.parse(old).randomizeDaily).toBe(true);
    expect(randomizeDaily).toBe(true);
  });
});
