/**
 * Plans against a real database (only with TEST_DATABASE_URL — it is wiped): the trial and its
 * one channel, sender limits, expiry, subscribing through Razorpay, renewals, upgrades paid as
 * the difference, downgrades at renewal, cancelling, failed payments.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, RazorpayClient, expireDueSubscriptions, startTrial } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../src/lib/accounts";
import { createCampaign, setCampaignStatus } from "../src/lib/campaigns";
import { createEmailCampaign } from "../src/lib/email-campaigns";
import { handleRazorpayWebhook } from "../src/lib/billing";
import { cancelPlan, choosePlan, confirmPlanCheckout } from "../src/lib/plan-checkout";
import { planView, senderProblem, sendingProblem, setTrialChannel } from "../src/lib/subscriptions";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const keys = { keyId: "rzp_test_k", keySecret: "sec", webhookSecret: "wh" };
const hmac = (s: string) => createHmac("sha256", "sec").update(s).digest("hex");
const DAY = 86_400_000;

d("plans and subscriptions", () => {
  let prisma: PrismaClient;
  const A = "ws-sub-a";
  const B = "ws-sub-b";
  const now = new Date("2026-11-13T10:00:00Z");
  const calls: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
  let n = 0;
  const period = { current_start: Math.floor(now.getTime() / 1000), current_end: Math.floor(Date.UTC(2026, 11, 13, 10) / 1000) };
  const fake = new RazorpayClient(keys, (async (u: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? "GET", url: u, body });
    const json = (v: unknown) => new Response(JSON.stringify(v));
    if (u.endsWith("/plans")) return json({ id: `plan_${++n}` });
    if (u.endsWith("/subscriptions")) return json({ id: `sub_${++n}`, plan_id: body?.plan_id, status: "created" });
    if (u.includes("/cancel")) return json({ id: "x", plan_id: "p", status: "cancelled" });
    if (u.includes("/subscriptions/")) return json({ id: u.split("/").pop(), plan_id: body?.plan_id ?? "p", status: "active", ...period });
    if (u.endsWith("/orders")) return json({ id: `order_${++n}`, amount: body?.amount, currency: "USD", status: "created" });
    return json({ id: u.split("/").pop(), order_id: "o", status: "captured", method: "card", amount: 3900, currency: "USD" });
  }) as unknown as typeof fetch);
  const deps = { keys, client: fake, now };
  const sub = (id = A) => prisma.subscription.findUniqueOrThrow({ where: { workspaceId: id } });
  const ws = (id = A) => prisma.workspace.findUniqueOrThrow({ where: { id } });
  const hook = (event: unknown) => {
    const raw = JSON.stringify(event);
    return handleRazorpayWebhook(prisma, raw, createHmac("sha256", "wh").update(raw).digest("hex"), keys, fake);
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.razorpayPlan.deleteMany({});
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    await startTrial(prisma, A, { days: 7, credits: 20, channels: ["linkedin", "email"], now });
    await startTrial(prisma, B, { days: 7, credits: 20, channels: ["linkedin", "email"], now: new Date(now.getTime() - 8 * DAY) });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("starts a 7-day trial: 20 credits, then one channel chosen at onboarding", async () => {
    expect(await sub()).toMatchObject({ plan: "trial", status: "TRIALING", monthlyCredits: 20, trialEndsAt: new Date(now.getTime() + 7 * DAY) });
    expect(await setTrialChannel(prisma, A, "whatsapp")).toMatchObject({ ok: false });
    expect(await setTrialChannel(prisma, A, "linkedin")).toEqual({ ok: true, value: undefined });
    expect(await ws()).toMatchObject({ channels: ["linkedin"], aiMonthly: 20, verifyMonthly: 100 });
  });

  it("allows one sender on the trial's channel, none on others (checked on the server)", async () => {
    const acc = (label: string) => createAccount(prisma, A, { label, timezone: "Asia/Kolkata", proxyUrl: "http://u:p@1.2.3.4:8000", warmup: false } as never);
    expect(await acc("First")).toMatchObject({ ok: true });
    expect(await acc("Second")).toMatchObject({ ok: false, error: expect.stringContaining("free trial includes one LinkedIn sender") });
    expect(await senderProblem(prisma, A, "email")).toMatch(/doesn't include Email Outreach/);
  });

  it("stops creating and starting campaigns once the trial has expired, and pauses running ones", async () => {
    expect(await sendingProblem(prisma, B, now)).toBe("Your free trial has expired. Upgrade your plan to continue using Invytra's outreach features.");
    expect(await createEmailCampaign(prisma, B, "Late")).toMatchObject({ ok: false, error: expect.stringContaining("free trial has expired") });
    const c = await prisma.campaign.create({ data: { workspaceId: B, name: "Running", status: "ACTIVE", steps: [] } });
    expect(await expireDueSubscriptions(prisma, now)).toBeGreaterThanOrEqual(1);
    expect(await sub(B)).toMatchObject({ status: "EXPIRED" });
    expect(await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "PAUSED" });
    expect(await ws(B)).toMatchObject({ aiMonthly: 0, verifyMonthly: 0 });
    expect(await setCampaignStatus(prisma, B, c.id, "ACTIVE")).toMatchObject({ ok: false, error: expect.stringContaining("Upgrade your plan") });
    expect(await createCampaign(prisma, B, { name: "x", steps: [] } as never)).toMatchObject({ ok: false });
    // The data is still there to look at.
    expect(await prisma.campaign.count({ where: { workspaceId: B } })).toBe(1);
    expect(await prisma.subscriptionEvent.findFirst({ where: { workspaceId: B, kind: "expired" } })).toMatchObject({ detail: { reason: "trial ended", campaignsPaused: 1 } });
  });

  it("subscribes: a Razorpay plan for the exact price, a subscription, then only a valid signature activates it", async () => {
    expect(await choosePlan(prisma, A, "u1", { plan: "starter", cycle: "monthly", channels: ["linkedin"] }, deps)).toMatchObject({ ok: false, error: expect.stringContaining("choose 2") });
    expect(await choosePlan(prisma, A, "u1", { plan: "starter", channels: ["email", "whatsapp"] }, deps)).toMatchObject({ ok: false, error: expect.stringContaining("Remove it first") });
    const r = await choosePlan(prisma, A, "u1", { plan: "starter", cycle: "monthly", channels: ["linkedin", "email"], extra: { linkedin: 2 } }, deps);
    if (!r.ok || r.value.kind !== "subscription") throw new Error(`expected a subscription checkout: ${JSON.stringify(r)}`);
    expect(r.value.amountCents).toBe(7900);
    expect(calls.find((c) => c.url.endsWith("/plans"))?.body).toMatchObject({ period: "monthly", interval: 1, item: { amount: 7900, currency: "USD" } });
    expect(calls.find((c) => c.url.endsWith("/subscriptions"))?.body).toMatchObject({ total_count: 120 });

    const { checkoutId, subscriptionId } = r.value;
    expect(await confirmPlanCheckout(prisma, A, { checkoutId, subscriptionId, paymentId: "pay_s1", signature: "forged" }, deps)).toMatchObject({ ok: false });
    expect(await confirmPlanCheckout(prisma, B, { checkoutId, subscriptionId, paymentId: "pay_s1", signature: hmac(`pay_s1|${subscriptionId}`) }, deps)).toMatchObject({ ok: false });
    expect((await sub()).plan).toBe("trial");
    expect(await confirmPlanCheckout(prisma, A, { checkoutId, subscriptionId, paymentId: "pay_s1", signature: hmac(`pay_s1|${subscriptionId}`) }, deps)).toMatchObject({ ok: true });

    expect(await sub()).toMatchObject({ plan: "starter", status: "ACTIVE", billingCycle: "monthly", channels: ["linkedin", "email"], extraSenders: { linkedin: 2 }, monthlyCredits: 250, priceCents: 7900, razorpaySubscriptionId: subscriptionId, currentPeriodEnd: new Date(period.current_end * 1000) });
    expect(await ws()).toMatchObject({ plan: "starter", channels: ["linkedin", "email"], aiMonthly: 250, verifyMonthly: 1000 });
    expect(await prisma.verifyCreditPurchase.findFirst({ where: { workspaceId: A, kind: "PLAN" } })).toMatchObject({ razorpayPaymentId: "pay_s1", status: "PAID", invoiceNumber: expect.stringMatching(/^INV-/) });
    // Now 3 LinkedIn senders and 1 mailbox are allowed.
    const v = await planView(prisma, A, now);
    expect(v.limits).toEqual({ linkedin: 3, email: 1, whatsapp: 0 });
    expect(await senderProblem(prisma, A, "linkedin")).toBeNull();
    // Razorpay's own notice of the same payment changes nothing (one invoice).
    await hook({ event: "subscription.charged", payload: { subscription: { entity: { id: subscriptionId, ...period } }, payment: { entity: { id: "pay_s1", amount: 7900, method: "card" } } } });
    expect(await prisma.verifyCreditPurchase.count({ where: { workspaceId: A, kind: "PLAN" } })).toBe(1);
  });

  it("an upgrade during the period is the difference for the days left, applied once paid", async () => {
    const mid = new Date((period.current_start + (period.current_end - period.current_start) / 2) * 1000);
    const r = await choosePlan(prisma, A, "u1", { plan: "growth", cycle: "monthly", extra: { linkedin: 2 } }, { ...deps, now: mid });
    if (!r.ok || r.value.kind !== "order") throw new Error(`expected an upgrade order: ${JSON.stringify(r)}`);
    // Growth with 2 extra LinkedIn senders is $89 vs $79 now: half a period left = $5.
    expect(r.value.amount).toBe(500);
    expect((await sub()).plan).toBe("starter");
    const orderId = r.value.orderId;
    await hook({ event: "order.paid", payload: { order: { entity: { id: orderId } }, payment: { entity: { id: "pay_up", order_id: orderId, amount: 500, method: "card" } } } });
    expect(await sub()).toMatchObject({ plan: "growth", channels: ["linkedin", "email", "whatsapp"], priceCents: 8900, monthlyCredits: 500 });
    // Renewals now charge the new price (from the next cycle).
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toMatchObject({ schedule_change_at: "cycle_end" });
    expect(await prisma.verifyCreditPurchase.findFirst({ where: { razorpayPaymentId: "pay_up" } })).toMatchObject({ priceCents: 500, description: expect.stringContaining("Upgrade to Growth") });
  });

  it("less applies at the next renewal, only if the connected senders fit", async () => {
    for (const [i, label] of ["B2", "B3"].entries())
      expect(await createAccount(prisma, A, { label, timezone: "Asia/Kolkata", proxyUrl: `http://u:p@1.2.3.${10 + i}:8000`, warmup: false } as never)).toMatchObject({ ok: true });
    expect(await choosePlan(prisma, A, "u1", { plan: "growth", cycle: "monthly" }, deps)).toMatchObject({ ok: false, error: expect.stringContaining("Remove 2 first") });
    await prisma.linkedinAccount.deleteMany({ where: { workspaceId: A, label: { in: ["B2", "B3"] } } });
    const r = await choosePlan(prisma, A, "u1", { plan: "growth", cycle: "monthly" }, deps);
    expect(r).toMatchObject({ ok: true, value: { kind: "scheduled" } });
    expect(await sub()).toMatchObject({ plan: "growth", priceCents: 8900, pendingChange: { priceCents: 4900 } });
    // The renewal: new period, the change applies, its invoice.
    const next = { current_start: period.current_end, current_end: period.current_end + 31 * 86400 };
    const s = await sub();
    await hook({ event: "subscription.charged", payload: { subscription: { entity: { id: s.razorpaySubscriptionId, ...next } }, payment: { entity: { id: "pay_r2", amount: 4900, method: "card" } } } });
    expect(await sub()).toMatchObject({ priceCents: 4900, extraSenders: {}, pendingChange: null, currentPeriodEnd: new Date(next.current_end * 1000), paymentStatus: "PAID" });
    expect(await prisma.verifyCreditPurchase.count({ where: { workspaceId: A, kind: "PLAN" } })).toBe(3);
  });

  it("a failed renewal retries (sending goes on), then stops when Razorpay gives up", async () => {
    const s = await sub();
    await hook({ event: "subscription.pending", payload: { subscription: { entity: { id: s.razorpaySubscriptionId } } } });
    expect(await sub()).toMatchObject({ status: "PAST_DUE", paymentStatus: "FAILED" });
    expect(await sendingProblem(prisma, A)).toBeNull();
    await hook({ event: "subscription.halted", payload: { subscription: { entity: { id: s.razorpaySubscriptionId } } } });
    expect(await sub()).toMatchObject({ status: "EXPIRED" });
    expect(await sendingProblem(prisma, A)).toMatch(/plan has ended/);
    // Paid again: back to normal, with the monthly credits.
    const later = { current_start: period.current_end + 40 * 86400, current_end: period.current_end + 70 * 86400 };
    await hook({ event: "subscription.charged", payload: { subscription: { entity: { id: s.razorpaySubscriptionId, ...later } }, payment: { entity: { id: "pay_r3", amount: 4900 } } } });
    expect(await sub()).toMatchObject({ status: "ACTIVE", paymentStatus: "PAID" });
    expect(await ws()).toMatchObject({ aiMonthly: 500 });
  });

  it("activates from Razorpay's notice alone when the browser closed after paying", async () => {
    const C = "ws-sub-c";
    await prisma.workspace.deleteMany({ where: { id: C } });
    await prisma.workspace.create({ data: { id: C, name: "Closed tab" } });
    await startTrial(prisma, C, { days: 7, credits: 20, channels: ["email"], now });
    const r = await choosePlan(prisma, C, "u1", { plan: "growth", cycle: "yearly" }, deps);
    if (!r.ok || r.value.kind !== "subscription") throw new Error("expected a subscription");
    expect(r.value.amountCents).toBe(49980);
    await hook({ event: "subscription.charged", payload: { subscription: { entity: { id: r.value.subscriptionId, ...period } }, payment: { entity: { id: "pay_c1", amount: 49980, method: "card" } } } });
    expect(await sub(C)).toMatchObject({ plan: "growth", status: "ACTIVE", billingCycle: "yearly", priceCents: 49980 });
    expect(await prisma.verifyCreditPurchase.count({ where: { workspaceId: C, kind: "PLAN" } })).toBe(1);
    // The checkout coming back late changes nothing.
    expect(await confirmPlanCheckout(prisma, C, { checkoutId: r.value.checkoutId, subscriptionId: r.value.subscriptionId, paymentId: "pay_c1", signature: hmac(`pay_c1|${r.value.subscriptionId}`) }, deps)).toMatchObject({ ok: true });
    expect(await prisma.verifyCreditPurchase.count({ where: { workspaceId: C, kind: "PLAN" } })).toBe(1);
    await prisma.workspace.delete({ where: { id: C } });
  });

  it("cancels at the end of the paid period", async () => {
    const r = await cancelPlan(prisma, A, deps);
    expect(r).toMatchObject({ ok: true });
    expect(calls.at(-1)).toMatchObject({ url: expect.stringContaining("/cancel"), body: { cancel_at_cycle_end: 1 } });
    const s = await sub();
    expect(s).toMatchObject({ status: "CANCELLED", cancelAtPeriodEnd: true });
    expect(await sendingProblem(prisma, A)).toBeNull();
    expect(await expireDueSubscriptions(prisma, new Date(s.currentPeriodEnd!.getTime() + 1000))).toBeGreaterThanOrEqual(1);
    expect(await sub()).toMatchObject({ status: "EXPIRED" });
  });
});
