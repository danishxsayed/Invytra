import { describe, expect, it } from "vitest";
import { PLANS, TRIAL, canSend, effectiveStatus, formatMoney, normalizeChoice, notSendingMessage, quotePlan, senderLimit, type PlanChoice } from "../src/index.js";

const choice = (c: Partial<PlanChoice> & Pick<PlanChoice, "plan">): PlanChoice => ({ cycle: "monthly", channels: c.plan === "growth" ? ["linkedin", "email", "whatsapp"] : ["linkedin", "email"], extra: {}, ...c });

describe("plans", () => {
  it("has the trial, Starter, Growth and VIP", () => {
    expect(PLANS.starter).toMatchObject({ monthlyCents: 3900, credits: 250, channels: 2 });
    expect(PLANS.growth).toMatchObject({ monthlyCents: 4900, credits: 500, channels: 3, recommended: true });
    expect(PLANS.vip.monthlyCents).toBeNull();
    expect(TRIAL).toMatchObject({ days: 7, channels: 1, credits: 20 });
  });

  it("adds $20 a month per extra LinkedIn sender (the spec's table)", () => {
    const totals = [0, 1, 2, 3].map((n) => quotePlan(choice({ plan: "starter", extra: { linkedin: n } })).periodCents);
    expect(totals).toEqual([3900, 5900, 7900, 9900]);
    const q = quotePlan(choice({ plan: "starter", extra: { linkedin: 2 } }));
    expect(q.lines).toEqual([
      { label: "Starter plan", cents: 3900 },
      { label: "2 extra LinkedIn senders", cents: 4000 },
    ]);
  });

  it("charges email mailboxes $5 each, and WhatsApp numbers aren't sold yet", () => {
    expect(quotePlan(choice({ plan: "growth", extra: { email: 3 } })).periodCents).toBe(4900 + 1500);
    expect(normalizeChoice({ plan: "growth", extra: { whatsapp: 1 } })).toMatchObject({ ok: false, error: expect.stringContaining("aren't available yet") });
  });

  it("takes 15% off a year, add-ons included, and shows the full price to strike through", () => {
    expect(quotePlan(choice({ plan: "starter", cycle: "yearly" }))).toMatchObject({ periodCents: 39780, listCents: 46800, savedCents: 7020 });
    expect(quotePlan(choice({ plan: "growth", cycle: "yearly" })).periodCents).toBe(49980);
    expect(quotePlan(choice({ plan: "starter", cycle: "yearly", extra: { linkedin: 1 } })).periodCents).toBe(39780 + 20400);
    expect(formatMoney(39780)).toBe("$397.80");
    expect(formatMoney(3900)).toBe("$39");
  });

  it("checks the channels: Starter exactly two, Growth all three", () => {
    expect(normalizeChoice({ plan: "starter", channels: ["linkedin"] })).toMatchObject({ ok: false });
    expect(normalizeChoice({ plan: "starter", channels: ["linkedin", "email", "whatsapp"] })).toMatchObject({ ok: false });
    expect(normalizeChoice({ plan: "starter", channels: ["email", "whatsapp", "email"] })).toMatchObject({ ok: true, choice: { channels: ["email", "whatsapp"] } });
    expect(normalizeChoice({ plan: "growth", channels: [] })).toMatchObject({ ok: true, choice: { channels: ["linkedin", "email", "whatsapp"] } });
    expect(normalizeChoice({ plan: "starter", channels: ["linkedin", "email"], extra: { whatsapp: 2 } })).toMatchObject({ ok: false, error: expect.stringContaining("only to a channel in your plan") });
    expect(normalizeChoice({ plan: "vip" })).toMatchObject({ ok: false });
    expect(normalizeChoice({ plan: "starter", channels: ["linkedin", "email"], extra: { linkedin: 51 } })).toMatchObject({ ok: false, error: expect.stringContaining("VIP") });
  });

  it("gives one sender per channel in the plan, plus extras; VIP limits are its own", () => {
    const base = { status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null };
    const s = { ...base, plan: "starter", channels: ["linkedin", "email"], extraSenders: { linkedin: 2 } };
    expect([senderLimit(s, "linkedin"), senderLimit(s, "email"), senderLimit(s, "whatsapp")]).toEqual([3, 1, 0]);
    const vip = { ...base, plan: "vip", channels: ["linkedin", "email"], extraSenders: {}, customSenders: { linkedin: 25 } };
    expect([senderLimit(vip, "linkedin"), senderLimit(vip, "email")]).toEqual([25, 1]);
  });

  it("stops sending when a trial or a cancelled plan runs out, even before it's marked", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    const trial = { plan: "trial", status: "TRIALING", channels: ["email"], extraSenders: {}, trialEndsAt: new Date("2026-11-19T23:00:00Z"), currentPeriodEnd: null };
    expect(effectiveStatus(trial, now)).toBe("EXPIRED");
    expect(canSend({ ...trial, trialEndsAt: new Date("2026-11-21T00:00:00Z") }, now)).toBe(true);
    expect(notSendingMessage(trial)).toBe("Your free trial has expired. Upgrade your plan to continue using Invytra's outreach features.");
    const cancelled = { plan: "growth", status: "CANCELLED", channels: [], extraSenders: {}, trialEndsAt: null, currentPeriodEnd: new Date("2026-11-25T00:00:00Z") };
    expect(canSend(cancelled, now)).toBe(true);
    expect(canSend({ ...cancelled, currentPeriodEnd: new Date("2026-11-19T00:00:00Z") }, now)).toBe(false);
    expect(canSend({ ...cancelled, status: "PAST_DUE" }, now)).toBe(true);
  });
});
