import { describe, expect, it } from "vitest";
import { PRICE_TIERS, formatMoney, priceFor, tierFor } from "../src/index.js";

describe("price list", () => {
  it("covers every sender count with no gaps or overlaps", () => {
    for (let n = 1; n <= 500; n++) {
      expect(PRICE_TIERS.filter((t) => n >= t.minSenders && (t.maxSenders === null || n <= t.maxSenders))).toHaveLength(1);
    }
    for (let i = 1; i < PRICE_TIERS.length; i++) {
      expect(PRICE_TIERS[i]!.perSender.USD).toBeLessThan(PRICE_TIERS[i - 1]!.perSender.USD);
      expect(PRICE_TIERS[i]!.perSender.INR).toBeLessThan(PRICE_TIERS[i - 1]!.perSender.INR);
    }
  });

  it("prices packages", () => {
    expect(priceFor(1)).toMatchObject({ perSender: 29, perMonth: 29, charged: 29 });
    expect(priceFor(5)).toMatchObject({ perSender: 24, perMonth: 120, tier: { id: "team" } });
    expect(priceFor(25)).toMatchObject({ perSender: 15, perMonth: 375, tier: { id: "agency" } });
    expect(priceFor(50, { currency: "INR" })).toMatchObject({ perSender: 999, perMonth: 49950 });
    expect(priceFor(150).quote).toBe(true);
  });

  it("charges 10 months for a year", () => {
    const y = priceFor(5, { billing: "yearly" });
    expect(y.charged).toBe(1200);
    expect(y.perSender).toBe(20);
    expect(y.perMonth).toBe(100);
    expect(priceFor(1, { billing: "yearly", currency: "INR" }).charged).toBe(24990);
  });

  it("points out when the next package costs less", () => {
    expect(priceFor(9).betterDeal).toEqual({ senders: 10, perMonth: 190 });
    expect(priceFor(5).betterDeal).toBeUndefined();
    expect(priceFor(24).betterDeal).toEqual({ senders: 25, perMonth: 375 });
  });

  it("handles odd input and formats money", () => {
    expect(tierFor(0).id).toBe("solo");
    expect(priceFor(3.7).senders).toBe(3);
    expect(formatMoney(1200, "USD")).toBe("$1,200");
    expect(formatMoney(24.17, "USD")).toBe("$24.17");
    expect(formatMoney(149950, "INR")).toBe("₹1,49,950");
  });
});
