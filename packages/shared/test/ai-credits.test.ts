import { describe, expect, it } from "vitest";
import { AI_COSTS, AI_PACKS, aiBalance, monthlyAiCredits } from "../src/ai-credits.js";

describe("AI credits", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  it("gives paid plans 500 a month and the trial 50", () => {
    expect(monthlyAiCredits("pro")).toBe(500);
    expect(monthlyAiCredits("trial")).toBe(50);
  });
  it("prices each action", () => {
    expect(AI_COSTS).toEqual({ TEXT: 1, NOTE: 1, HANDWRITTEN: 2, VOICE: 5, VIDEO: 15, INVY: 1 });
    expect(AI_PACKS.map((p) => [p.credits, p.priceCents])).toEqual([[2000, 1000], [5000, 2200]]);
  });
  it("counts this month, then extra, and starts fresh next month", () => {
    const ws = { plan: "pro", aiUsed: 120, aiPeriod: new Date("2026-11-01T00:00:00Z"), aiExtra: 2000 };
    expect(aiBalance(ws, now)).toMatchObject({ monthlyLeft: 380, extra: 2000, left: 2380 });
    expect(aiBalance(ws, new Date("2026-12-02T00:00:00Z")).monthlyLeft).toBe(500);
  });
});
