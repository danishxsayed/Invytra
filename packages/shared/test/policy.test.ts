import { describe, expect, it } from "vitest";
import {
  ACTION_DELAY_SECONDS,
  DEFAULT_LIMITS,
  DEFAULT_WORKING_HOURS,
  canExecute,
  isWithinWorkingHours,
  limitsSchema,
  randomActionDelayMs,
  type AccountPolicyInput,
  type UsageCounts,
} from "../src/index.js";

// Wed 15 Oct 2025, 10:30 IST = 05:00 UTC
const WED_MORNING_IST = new Date("2025-10-15T05:00:00Z");
// Wed 15 Oct 2025, 20:30 IST
const WED_NIGHT_IST = new Date("2025-10-15T15:00:00Z");
// Sat 18 Oct 2025, 11:30 IST
const SAT_IST = new Date("2025-10-18T06:00:00Z");

const account: AccountPolicyInput = {
  status: "ACTIVE",
  timeZone: "Asia/Kolkata",
  workingHours: DEFAULT_WORKING_HOURS,
  limits: DEFAULT_LIMITS,
};

const noUsage: UsageCounts = {
  today: { PROFILE_VISIT: 0, CONNECTION_REQUEST: 0, MESSAGE: 0 },
  connectionRequestsThisWeek: 0,
};

describe("working hours", () => {
  it("allows a weekday inside hours", () => {
    expect(isWithinWorkingHours(WED_MORNING_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS)).toBe(true);
  });
  it("blocks after end hour", () => {
    expect(isWithinWorkingHours(WED_NIGHT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS)).toBe(false);
  });
  it("blocks weekends by default", () => {
    expect(isWithinWorkingHours(SAT_IST, "Asia/Kolkata", DEFAULT_WORKING_HOURS)).toBe(false);
  });
  it("uses the account's own time zone", () => {
    // 05:00 UTC Wednesday is 01:00 in New York → outside hours
    expect(isWithinWorkingHours(WED_MORNING_IST, "America/New_York", DEFAULT_WORKING_HOURS)).toBe(false);
  });
});

describe("canExecute", () => {
  it("allows an action within limits and hours", () => {
    expect(canExecute("CONNECTION_REQUEST", account, noUsage, WED_MORNING_IST)).toEqual({ allowed: true });
  });
  it("blocks paused or flagged accounts", () => {
    const flagged = { ...account, status: "NEEDS_ATTENTION" as const };
    expect(canExecute("PROFILE_VISIT", flagged, noUsage, WED_MORNING_IST)).toEqual({
      allowed: false,
      reason: "ACCOUNT_NOT_ACTIVE",
    });
  });
  it("blocks outside working hours, even read-only actions", () => {
    expect(canExecute("INBOX_SYNC", account, noUsage, WED_NIGHT_IST)).toMatchObject({
      reason: "OUTSIDE_WORKING_HOURS",
    });
  });
  it("blocks at the daily cap", () => {
    const usage = { ...noUsage, today: { ...noUsage.today, CONNECTION_REQUEST: 20 } };
    expect(canExecute("CONNECTION_REQUEST", account, usage, WED_MORNING_IST)).toMatchObject({
      reason: "DAILY_LIMIT_REACHED",
    });
  });
  it("allows one below the daily cap", () => {
    const usage = { ...noUsage, today: { ...noUsage.today, MESSAGE: 49 } };
    expect(canExecute("MESSAGE", account, usage, WED_MORNING_IST)).toEqual({ allowed: true });
  });
  it("blocks at the weekly connection cap", () => {
    const usage = { ...noUsage, connectionRequestsThisWeek: 150 };
    expect(canExecute("CONNECTION_REQUEST", account, usage, WED_MORNING_IST)).toMatchObject({
      reason: "WEEKLY_LIMIT_REACHED",
    });
  });
  it("does not apply the weekly cap to messages", () => {
    const usage = { ...noUsage, connectionRequestsThisWeek: 150 };
    expect(canExecute("MESSAGE", account, usage, WED_MORNING_IST)).toEqual({ allowed: true });
  });
});

describe("limits schema", () => {
  it("rejects connection limits above the hard ceiling", () => {
    expect(limitsSchema.safeParse({ ...DEFAULT_LIMITS, connectionRequestsPerDay: 100 }).success).toBe(false);
  });
});

describe("randomActionDelayMs", () => {
  it("stays within the configured range", () => {
    const min = ACTION_DELAY_SECONDS.min * 1000;
    const max = ACTION_DELAY_SECONDS.max * 1000;
    expect(randomActionDelayMs(() => 0)).toBe(min);
    expect(randomActionDelayMs(() => 1)).toBe(max);
    for (let i = 0; i < 1000; i++) {
      const d = randomActionDelayMs();
      expect(d).toBeGreaterThanOrEqual(min);
      expect(d).toBeLessThanOrEqual(max);
    }
  });
});
