import { describe, expect, it } from "vitest";
import { DEFAULT_WORKING_HOURS, isWithinWorkingHours, nextWorkingWindowStart } from "../src/index.js";

describe("nextWorkingWindowStart", () => {
  it("returns the same time when already inside hours", () => {
    const wedMorningIst = new Date("2025-10-15T05:00:00Z"); // 10:30 IST
    expect(nextWorkingWindowStart(wedMorningIst, "Asia/Kolkata", DEFAULT_WORKING_HOURS)).toEqual(wedMorningIst);
  });
  it("moves a Wednesday-night action to Thursday 09:00 IST", () => {
    const wedNightIst = new Date("2025-10-15T16:00:00Z"); // 21:30 IST Wed
    expect(nextWorkingWindowStart(wedNightIst, "Asia/Kolkata", DEFAULT_WORKING_HOURS).toISOString()).toBe(
      "2025-10-16T03:30:00.000Z", // 09:00 IST Thu
    );
  });
  it("skips the weekend to Monday 09:00", () => {
    const satIst = new Date("2025-10-18T06:00:00Z");
    expect(nextWorkingWindowStart(satIst, "Asia/Kolkata", DEFAULT_WORKING_HOURS).toISOString()).toBe(
      "2025-10-20T03:30:00.000Z",
    );
  });
  it("uses the account's own zone", () => {
    const t = nextWorkingWindowStart(new Date("2025-10-15T23:00:00Z"), "America/New_York", DEFAULT_WORKING_HOURS);
    expect(isWithinWorkingHours(t, "America/New_York", DEFAULT_WORKING_HOURS)).toBe(true);
    expect(t.toISOString()).toBe("2025-10-16T13:00:00.000Z"); // 19:00 EDT Wed -> 09:00 EDT Thu
  });
});
