import {
  RazorpayClient,
  RazorpayError,
  checkoutSignatureOk,
  razorpayKeys,
  recordPlanPayment,
  recordSubscriptionEvent,
  subscriptionSignatureOk,
  writePlan,
  type Prisma,
  type PrismaClient,
  type RazorpayKeys,
  type RazorpaySubscription,
} from "@invytra/db";
import { PLAN_CHANNELS, PLANS, SENDER_LABEL, channelById, effectiveStatus, formatMoney, normalizeChoice, quotePlan, senderCounts, senderLimit, type BillingCycle, type PlanChoice, type SubscriptionLike } from "@invytra/shared";
import type { Result } from "./accounts";
import { readSubscription, sendersInUse } from "./subscriptions";

/*
 * Buying and changing plans through Razorpay (rules: subscriptions.ts and @invytra/shared).
 * - New plan: a Razorpay subscription, authorised at checkout, renews by itself.
 * - More during a period: the difference for the days left is paid now, then it applies.
 * - Less (or other channels on Starter): from the next renewal.
 * - Cancel: runs to the end of the paid period.
 */

const DAY = 86_400_000;
type Sub = NonNullable<Awaited<ReturnType<typeof readSubscription>>>;

export const describeChoice = (c: PlanChoice) => {
  const extras = PLAN_CHANNELS.filter((ch) => c.extra[ch]).map((ch) => `+${c.extra[ch]} ${c.extra[ch] === 1 ? SENDER_LABEL[ch].one : SENDER_LABEL[ch].many}`);
  return `${PLANS[c.plan].name}, ${c.cycle}${extras.length ? ` (${extras.join(", ")})` : ""}`;
};

/** A plan choice's limits, as a subscription would have them. */
const asSub = (c: PlanChoice): SubscriptionLike => ({ plan: c.plan, status: "ACTIVE", channels: c.channels, extraSenders: c.extra, trialEndsAt: null, currentPeriodEnd: null });

/** Whether the senders connected today fit a plan choice; the problem if not. */
async function fitsProblem(prisma: PrismaClient, workspaceId: string, c: PlanChoice): Promise<string | null> {
  const used = await sendersInUse(prisma, workspaceId);
  for (const ch of PLAN_CHANNELS) {
    const limit = senderLimit(asSub(c), ch);
    if (used[ch] > limit) {
      const name = channelById(ch)?.name ?? ch;
      return limit === 0
        ? `You have ${used[ch]} ${used[ch] === 1 ? SENDER_LABEL[ch].one : SENDER_LABEL[ch].many} connected on ${name}, which this plan doesn't include. Remove ${used[ch] === 1 ? "it" : "them"} first, or keep ${name} in your plan.`
        : `You have ${used[ch]} ${SENDER_LABEL[ch].many} connected; this plan allows ${limit}. Remove ${used[ch] - limit} first, or add more to the plan.`;
    }
  }
  return null;
}

const periodOf = (rs: RazorpaySubscription | null, cycle: BillingCycle, now: Date) => ({
  start: rs?.current_start ? new Date(rs.current_start * 1000) : now,
  end: rs?.current_end ? new Date(rs.current_end * 1000) : new Date(cycle === "yearly" ? Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())),
});

/** The Razorpay plan for this period and amount (made once, then reused). */
export async function razorpayPlanFor(prisma: PrismaClient, client: RazorpayClient, cycle: BillingCycle, cents: number, name: string): Promise<string> {
  const key = `${cycle}-${cents}`;
  const known = await prisma.razorpayPlan.findUnique({ where: { key } });
  if (known) return known.planId;
  const p = await client.createPlan({ period: cycle, amount: cents, currency: "USD", name: `Invytra ${name} (${cycle})`, notes: { key } });
  await prisma.razorpayPlan.upsert({ where: { key }, create: { key, planId: p.id }, update: {} });
  return p.id;
}

export type PlanCheckoutStart =
  | { kind: "subscription"; checkoutId: string; keyId: string; subscriptionId: string; description: string; amountCents: number }
  | { kind: "order"; checkoutId: string; keyId: string; orderId: string; amount: number; currency: string; description: string }
  | { kind: "applied"; message: string }
  | { kind: "scheduled"; message: string };

export const dayText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const failed = (e: unknown) => ({
  ok: false as const,
  error:
    e instanceof RazorpayError
      ? /currency/i.test(e.message)
        ? "Card payments in US dollars aren't switched on for our payment account yet. Please try again soon, or write to us and we'll set up your plan."
        : e.message
      : "Couldn't reach the payment service. Please try again.",
});

/**
 * The plan card's button: a new subscription (trial, expired or cancelled plans), or a change
 * to the plan that's running (more now, less from the next renewal).
 */
export async function choosePlan(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  input: unknown,
  deps: { keys?: RazorpayKeys | null; client?: RazorpayClient; now?: Date } = {},
): Promise<Result<PlanCheckoutStart>> {
  const now = deps.now ?? new Date();
  const raw = (input ?? {}) as { plan?: string; cycle?: string; channels?: string[]; extra?: Record<string, unknown> };
  const n = normalizeChoice({ plan: String(raw.plan ?? ""), cycle: raw.cycle, channels: raw.channels, extra: raw.extra });
  if (!n.ok) return n;
  const choice = n.choice;
  const keys = deps.keys === undefined ? razorpayKeys() : deps.keys;
  if (!keys) return { ok: false, error: "Online payment isn't switched on yet. Write to us and we'll set up your plan." };
  const client = deps.client ?? new RazorpayClient(keys);
  const s = await readSubscription(prisma, workspaceId);
  if (s?.plan === "vip" && effectiveStatus(s, now) !== "EXPIRED") return { ok: false, error: "Your workspace is on a custom VIP plan. Talk to us to change it." };
  const fits = await fitsProblem(prisma, workspaceId, choice);
  if (fits) return { ok: false, error: fits };
  const q = quotePlan(choice);

  const running = s && s.razorpaySubscriptionId && s.status !== "EXPIRED" && !s.cancelAtPeriodEnd && s.plan !== "trial" ? s : null;
  if (!running) {
    // A new subscription: authorised and first paid at checkout.
    try {
      const planId = await razorpayPlanFor(prisma, client, choice.cycle, q.periodCents, describeChoice(choice));
      const checkout = await prisma.planCheckout.create({ data: { workspaceId, kind: "SUBSCRIBE", choice: choice as unknown as Prisma.InputJsonValue, amountCents: q.periodCents, requestedBy: userId } });
      const rs = await client.createSubscription({ planId, totalCount: choice.cycle === "yearly" ? 10 : 120, notes: { workspaceId, checkoutId: checkout.id } });
      await prisma.planCheckout.update({ where: { id: checkout.id }, data: { razorpaySubscriptionId: rs.id } });
      return { ok: true, value: { kind: "subscription", checkoutId: checkout.id, keyId: keys.keyId, subscriptionId: rs.id, description: `${describeChoice(choice)}: ${formatMoney(q.periodCents)} a ${choice.cycle === "yearly" ? "year" : "month"}`, amountCents: q.periodCents } };
    } catch (e) {
      return failed(e);
    }
  }

  if (running.billingCycle !== choice.cycle)
    return { ok: false, error: `Your plan is billed ${running.billingCycle}. Switching between monthly and yearly isn't possible during a plan yet: cancel, and choose ${choice.cycle} when it ends.` };
  if (q.periodCents === running.priceCents && JSON.stringify(choice) === JSON.stringify(currentChoice(running))) return { ok: false, error: "That's already your plan." };

  const periodStart = running.currentPeriodStart ?? now;
  const periodEnd = running.currentPeriodEnd ?? now;
  const more = q.periodCents > running.priceCents;
  if (more) {
    // Pay the difference for the days left in this period; it applies as soon as it's paid.
    const left = Math.max(0, periodEnd.getTime() - now.getTime()) / Math.max(DAY, periodEnd.getTime() - periodStart.getTime());
    const due = Math.round((q.periodCents - running.priceCents) * Math.min(1, left));
    try {
      const planId = await razorpayPlanFor(prisma, client, choice.cycle, q.periodCents, describeChoice(choice));
      if (due < 100) {
        await client.updateSubscription(running.razorpaySubscriptionId!, { planId, at: "cycle_end" });
        await applyChoiceNow(prisma, workspaceId, choice, q.periodCents, "upgraded", { paidCents: 0 });
        return { ok: true, value: { kind: "applied", message: `Done: you're on ${describeChoice(choice)}. Less than $1 was due for the rest of this period, so there's nothing to pay now.` } };
      }
      const checkout = await prisma.planCheckout.create({ data: { workspaceId, kind: "UPGRADE", choice: choice as unknown as Prisma.InputJsonValue, amountCents: due, requestedBy: userId } });
      const order = await client.createOrder({ amount: due, currency: "USD", receipt: checkout.id, notes: { workspaceId, checkoutId: checkout.id } });
      await prisma.planCheckout.update({ where: { id: checkout.id }, data: { razorpayOrderId: order.id } });
      return { ok: true, value: { kind: "order", checkoutId: checkout.id, keyId: keys.keyId, orderId: order.id, amount: order.amount, currency: order.currency, description: `Upgrade to ${describeChoice(choice)} until ${dayText(periodEnd)}` } };
    } catch (e) {
      return failed(e);
    }
  }

  // Less, or the same price with other channels: from the next renewal.
  try {
    const planId = await razorpayPlanFor(prisma, client, choice.cycle, q.periodCents, describeChoice(choice));
    await client.updateSubscription(running.razorpaySubscriptionId!, { planId, at: "cycle_end" });
  } catch (e) {
    return failed(e);
  }
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { workspaceId }, data: { pendingChange: { choice, priceCents: q.periodCents, at: periodEnd.toISOString() } as unknown as Prisma.InputJsonValue } });
    await recordSubscriptionEvent(tx, workspaceId, "change_scheduled", { to: describeChoice(choice), priceCents: q.periodCents, at: periodEnd.toISOString() });
  });
  return { ok: true, value: { kind: "scheduled", message: `From ${dayText(periodEnd)} your plan will be ${describeChoice(choice)} (${formatMoney(q.periodCents)} a ${choice.cycle === "yearly" ? "year" : "month"}). Until then nothing changes.` } };
}

export function currentChoice(s: Sub): PlanChoice {
  return { plan: s.plan as PlanChoice["plan"], cycle: (s.billingCycle ?? "monthly") as BillingCycle, channels: PLAN_CHANNELS.filter((c) => s.channels.includes(c)), extra: senderCounts(s.extraSenders) };
}

/** Puts a plan choice in place now, keeping the current period. */
export async function applyChoiceNow(prisma: PrismaClient, workspaceId: string, choice: PlanChoice, priceCents: number, kind: string, detail: Record<string, unknown>) {
  await prisma.$transaction(async (tx) => {
    const s = await tx.subscription.findUniqueOrThrow({ where: { workspaceId } });
    await writePlan(tx, workspaceId, {
      plan: choice.plan,
      status: s.status === "PAST_DUE" ? "PAST_DUE" : "ACTIVE",
      billingCycle: choice.cycle,
      channels: choice.channels,
      extraSenders: choice.extra as Record<string, number>,
      monthlyCredits: PLANS[choice.plan].credits!,
      priceCents,
    });
    await recordSubscriptionEvent(tx, workspaceId, kind, { to: describeChoice(choice), priceCents, ...detail });
  });
}

/** Turns a paid-for new subscription into the workspace's plan (once). */
export async function activateSubscription(prisma: PrismaClient, checkoutId: string, rs: RazorpaySubscription | null, payment: { id: string; amount: number; method?: string | null } | null, client: RazorpayClient, now: Date): Promise<boolean> {
  const done = await prisma.planCheckout.updateMany({ where: { id: checkoutId, status: "PENDING" }, data: { status: "DONE", doneAt: now } });
  const c = await prisma.planCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
  if (done.count) {
    const choice = c.choice as unknown as PlanChoice;
    const old = await readSubscription(prisma, c.workspaceId);
    const period = periodOf(rs, choice.cycle, now);
    await prisma.$transaction(async (tx) => {
      await writePlan(
        tx,
        c.workspaceId,
        {
          plan: choice.plan,
          status: "ACTIVE",
          billingCycle: choice.cycle,
          channels: choice.channels,
          extraSenders: choice.extra as Record<string, number>,
          monthlyCredits: PLANS[choice.plan].credits!,
          priceCents: c.amountCents,
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          razorpaySubscriptionId: c.razorpaySubscriptionId,
          paymentStatus: "PAID",
        },
        now,
      );
      await recordSubscriptionEvent(tx, c.workspaceId, "subscribed", { plan: describeChoice(choice), priceCents: c.amountCents, until: period.end.toISOString() });
    });
    // A plan that was cancelled (or ran out) keeps no second subscription billing in the background.
    if (old?.razorpaySubscriptionId && old.razorpaySubscriptionId !== c.razorpaySubscriptionId)
      await client.cancelSubscription(old.razorpaySubscriptionId, false).catch(() => undefined);
  }
  if (payment) {
    const choice = c.choice as unknown as PlanChoice;
    const period = periodOf(rs, choice.cycle, now);
    await recordPlanPayment(prisma, c.workspaceId, { paymentId: payment.id, amountCents: payment.amount, currency: "USD", method: payment.method, description: `${describeChoice(choice)}: ${dayText(period.start)} – ${dayText(period.end)}` }, undefined, now);
  }
  return done.count > 0;
}

/** Applies a paid-for upgrade (once) and makes renewals charge the new price. */
export async function completeUpgrade(prisma: PrismaClient, checkoutId: string, payment: { id: string; amount: number; method?: string | null }, client: RazorpayClient, now: Date) {
  const done = await prisma.planCheckout.updateMany({ where: { id: checkoutId, status: "PENDING" }, data: { status: "DONE", doneAt: now } });
  const c = await prisma.planCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
  const choice = c.choice as unknown as PlanChoice;
  const q = quotePlan(choice);
  if (done.count) {
    await applyChoiceNow(prisma, c.workspaceId, choice, q.periodCents, "upgraded", { paidCents: c.amountCents });
    const s = await readSubscription(prisma, c.workspaceId);
    if (s?.razorpaySubscriptionId) {
      try {
        const planId = await razorpayPlanFor(prisma, client, choice.cycle, q.periodCents, describeChoice(choice));
        await client.updateSubscription(s.razorpaySubscriptionId, { planId, at: "cycle_end" });
      } catch (e) {
        // Paid and applied; only the renewal price didn't move. The team sees it in the history.
        await recordSubscriptionEvent(prisma, c.workspaceId, "renewal_price_not_updated", { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
      }
    }
  }
  const s = await readSubscription(prisma, c.workspaceId);
  await recordPlanPayment(prisma, c.workspaceId, { paymentId: payment.id, amountCents: payment.amount, currency: "USD", method: payment.method, orderId: c.razorpayOrderId, description: `Upgrade to ${describeChoice(choice)}${s?.currentPeriodEnd ? ` until ${dayText(s.currentPeriodEnd)}` : ""}` }, undefined, now);
}

/** The checkout came back: checked against Razorpay's signature before anything changes. */
export async function confirmPlanCheckout(
  prisma: PrismaClient,
  workspaceId: string,
  input: { checkoutId: string; paymentId: string; signature: string; subscriptionId?: string; orderId?: string },
  deps: { keys?: RazorpayKeys | null; client?: RazorpayClient; now?: Date } = {},
): Promise<Result<{ message: string }>> {
  const keys = deps.keys === undefined ? razorpayKeys() : deps.keys;
  if (!keys) return { ok: false, error: "Payments aren't set up." };
  const now = deps.now ?? new Date();
  const client = deps.client ?? new RazorpayClient(keys);
  const c = await prisma.planCheckout.findFirst({ where: { id: input.checkoutId, workspaceId } });
  const sorry = { ok: false as const, error: "We couldn't confirm this payment. If you were charged, your plan updates automatically within a few minutes." };
  if (!c) return sorry;
  const pay = await client.payment(input.paymentId).catch(() => null);
  if (c.kind === "SUBSCRIBE") {
    if (!c.razorpaySubscriptionId || input.subscriptionId !== c.razorpaySubscriptionId || !subscriptionSignatureOk(keys.keySecret, c.razorpaySubscriptionId, input.paymentId, input.signature)) return sorry;
    const rs = await client.subscription(c.razorpaySubscriptionId).catch(() => null);
    await activateSubscription(prisma, c.id, rs, pay ? { id: pay.id, amount: pay.amount, method: pay.method } : null, client, now);
    return { ok: true, value: { message: `You're on ${describeChoice(c.choice as unknown as PlanChoice)}. Thank you!` } };
  }
  if (!c.razorpayOrderId || input.orderId !== c.razorpayOrderId || !checkoutSignatureOk(keys.keySecret, c.razorpayOrderId, input.paymentId, input.signature)) return sorry;
  await completeUpgrade(prisma, c.id, { id: input.paymentId, amount: pay?.amount ?? c.amountCents, method: pay?.method ?? null }, client, now);
  return { ok: true, value: { message: `Upgraded to ${describeChoice(c.choice as unknown as PlanChoice)}.` } };
}

/** Cancels at the end of the paid period (campaigns keep running until then). */
export async function cancelPlan(prisma: PrismaClient, workspaceId: string, deps: { keys?: RazorpayKeys | null; client?: RazorpayClient } = {}): Promise<Result<{ endsAt: Date | null }>> {
  const s = await readSubscription(prisma, workspaceId);
  if (!s || s.plan === "trial" || s.status === "EXPIRED") return { ok: false, error: "There's no paid plan to cancel." };
  if (s.cancelAtPeriodEnd) return { ok: false, error: "Your plan is already set to end." };
  if (s.razorpaySubscriptionId) {
    const keys = deps.keys === undefined ? razorpayKeys() : deps.keys;
    if (!keys) return { ok: false, error: "Payments aren't set up." };
    try {
      await (deps.client ?? new RazorpayClient(keys)).cancelSubscription(s.razorpaySubscriptionId, true);
    } catch (e) {
      return failed(e);
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { workspaceId }, data: { status: "CANCELLED", cancelAtPeriodEnd: true, pendingChange: null as unknown as Prisma.InputJsonValue } });
    await recordSubscriptionEvent(tx, workspaceId, "cancelled", { endsAt: s.currentPeriodEnd?.toISOString() ?? null });
  });
  return { ok: true, value: { endsAt: s.currentPeriodEnd } };
}

/** Drops a change scheduled for the next renewal (the plan stays as it is). */
export async function keepCurrentPlan(prisma: PrismaClient, workspaceId: string, deps: { keys?: RazorpayKeys | null; client?: RazorpayClient } = {}): Promise<Result> {
  const s = await readSubscription(prisma, workspaceId);
  if (!s?.pendingChange || !s.razorpaySubscriptionId) return { ok: false, error: "There's no change waiting." };
  const keys = deps.keys === undefined ? razorpayKeys() : deps.keys;
  if (!keys) return { ok: false, error: "Payments aren't set up." };
  const client = deps.client ?? new RazorpayClient(keys);
  const choice = currentChoice(s);
  try {
    const planId = await razorpayPlanFor(prisma, client, choice.cycle, s.priceCents, describeChoice(choice));
    await client.updateSubscription(s.razorpaySubscriptionId, { planId, at: "cycle_end" });
  } catch (e) {
    return failed(e);
  }
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { workspaceId }, data: { pendingChange: null as unknown as Prisma.InputJsonValue } });
    await recordSubscriptionEvent(tx, workspaceId, "change_dropped", {});
  });
  return { ok: true, value: undefined };
}

