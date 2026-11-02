import { describe, expect, it } from "vitest";
import { VERIFY_PACKS, monthlyVerifyCredits, usd, verifyBalance, verifyPack } from "../src/verify-credits.js";

describe("verification credits", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  it("gives paid plans 1,000 a month and the trial 100", () => {
    expect(monthlyVerifyCredits("pro")).toBe(1000);
    expect(monthlyVerifyCredits("trial")).toBe(100);
  });
  it("counts this month's use, then extra credits", () => {
    expect(verifyBalance({ plan: "pro", verifyUsed: 300, verifyPeriod: new Date("2026-11-01T00:00:00Z"), verifyExtra: 5000 }, now)).toMatchObject({
      monthlyLeft: 700,
      extra: 5000,
      left: 5700,
      resetsAt: new Date("2026-12-01T00:00:00Z"),
    });
  });
  it("starts fresh in a new month", () => {
    expect(verifyBalance({ plan: "pro", verifyUsed: 1000, verifyPeriod: new Date("2026-10-01T00:00:00Z"), verifyExtra: 0 }, now).monthlyLeft).toBe(1000);
  });
  it("sells 5,000 for $7.50", () => {
    expect(verifyPack("5k")).toEqual({ id: "5k", credits: 5000, priceCents: 750 });
    expect(usd(VERIFY_PACKS[0]!.priceCents)).toBe("$7.50");
    expect(verifyPack("nope")).toBeNull();
  });
});
