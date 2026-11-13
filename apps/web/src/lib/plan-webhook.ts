import { PAID_VERIFY_MONTHLY, RazorpayClient, expireSubscription, recordPlanPayment, recordSubscriptionEvent, writePlan, type PrismaClient, type RazorpayKeys, type RazorpaySubscription } from "@invytra/db";
import { PLANS, planById } from "@invytra/shared";
import { activateSubscription, completeUpgrade, dayText, describeChoice } from "./plan-checkout";
import { readSubscription, type PlanView } from "./subscriptions";

/*
 * Razorpay's notices about plans (from the webhook): a new subscription's first payment when
 * the checkout didn't come back, renewals (and changes waiting for them), failed payments,
 * cancellations, and mid-period upgrade payments.
 */

const DAY = 86_400_000;

type Entity<T> = { entity?: T };
export interface RazorpayEvent {
  event?: string;
  payload?: {
    subscription?: Entity<RazorpaySubscription>;
    payment?: Entity<{ id?: string; amount?: number; method?: string; order_id?: string; currency?: string }>;
    order?: Entity<{ id?: string }>;
  };
}

/** Subscription and upgrade events. Returns true when it was one of ours. */
export async function handlePlanWebhook(prisma: PrismaClient, event: RazorpayEvent, keys: RazorpayKeys, now = new Date(), client: RazorpayClient = new RazorpayClient(keys)): Promise<boolean> {
  const rs = event.payload?.subscription?.entity;
  const pay = event.payload?.payment?.entity;

  // A mid-period upgrade's one-time payment.
  if ((event.event === "order.paid" || event.event === "payment.captured") && !rs) {
    const orderId = event.payload?.order?.entity?.id ?? pay?.order_id;
    if (!orderId || !pay?.id) return false;
    const c = await prisma.planCheckout.findUnique({ where: { razorpayOrderId: orderId } });
    if (!c) return false;
    await completeUpgrade(prisma, c.id, { id: pay.id, amount: pay.amount ?? c.amountCents, method: pay.method ?? null }, client, now);
    return true;
  }
  if (!rs?.id || !event.event?.startsWith("subscription.")) return false;

  // The first payment of a new subscription (the checkout may not have come back).
  const pending = await prisma.planCheckout.findUnique({ where: { razorpaySubscriptionId: rs.id } });
  if (pending?.status === "PENDING" && (event.event === "subscription.activated" || event.event === "subscription.charged")) {
    await activateSubscription(prisma, pending.id, rs, event.event === "subscription.charged" && pay?.id ? { id: pay.id, amount: pay.amount ?? pending.amountCents, method: pay.method ?? null } : null, client, now);
    return true;
  }

  const s = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: rs.id } });
  if (!s) return !!pending;
  const ws = s.workspaceId;
  switch (event.event) {
    case "subscription.charged": {
      // A renewal: the new period, a change that was waiting, and its invoice.
      const start = rs.current_start ? new Date(rs.current_start * 1000) : now;
      const end = rs.current_end ? new Date(rs.current_end * 1000) : null;
      const pendingChange = s.pendingChange as PlanView["pending"];
      const renewal = !s.currentPeriodStart || start.getTime() > s.currentPeriodStart.getTime() + DAY;
      await prisma.$transaction(async (tx) => {
        if (renewal && pendingChange && new Date(pendingChange.at).getTime() <= start.getTime() + DAY) {
          const c = pendingChange.choice;
          await writePlan(tx, ws, { plan: c.plan, status: "ACTIVE", billingCycle: c.cycle, channels: c.channels, extraSenders: c.extra as Record<string, number>, monthlyCredits: PLANS[c.plan].credits!, priceCents: pendingChange.priceCents, currentPeriodStart: start, currentPeriodEnd: end, paymentStatus: "PAID" });
          await recordSubscriptionEvent(tx, ws, "change_applied", { to: describeChoice(c) });
        } else {
          await tx.subscription.update({ where: { workspaceId: ws }, data: { status: s.cancelAtPeriodEnd ? "CANCELLED" : "ACTIVE", currentPeriodStart: start, currentPeriodEnd: end, paymentStatus: "PAID" } });
          // Back from a failed payment or an ended plan: the monthly allowances come back too.
          await tx.workspace.update({ where: { id: ws }, data: { aiMonthly: s.monthlyCredits, verifyMonthly: PAID_VERIFY_MONTHLY, plan: s.plan, channels: s.channels } });
        }
        if (renewal) await recordSubscriptionEvent(tx, ws, "renewed", { until: end?.toISOString() ?? null, amountCents: pay?.amount ?? null });
      });
      if (pay?.id) {
        const fresh = await readSubscription(prisma, ws);
        await recordPlanPayment(prisma, ws, { paymentId: pay.id, amountCents: pay.amount ?? s.priceCents, currency: "USD", method: pay.method ?? null, description: `${planById(fresh?.plan).name} plan, ${fresh?.billingCycle ?? "monthly"}: ${dayText(start)}${end ? ` – ${dayText(end)}` : ""}` }, undefined, now);
      }
      return true;
    }
    case "subscription.pending":
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({ where: { workspaceId: ws }, data: { status: "PAST_DUE", paymentStatus: "FAILED" } });
        await recordSubscriptionEvent(tx, ws, "payment_failed", { retrying: true });
      });
      return true;
    case "subscription.halted":
      await prisma.subscription.update({ where: { workspaceId: ws }, data: { paymentStatus: "FAILED" } });
      await expireSubscription(prisma, ws, "renewal payment failed");
      return true;
    case "subscription.cancelled":
    case "subscription.completed": {
      const ended = !s.currentPeriodEnd || s.currentPeriodEnd <= now;
      if (ended) await expireSubscription(prisma, ws, event.event === "subscription.completed" ? "plan completed" : "plan cancelled");
      else if (s.status !== "CANCELLED")
        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({ where: { workspaceId: ws }, data: { status: "CANCELLED", cancelAtPeriodEnd: true } });
          await recordSubscriptionEvent(tx, ws, "cancelled", { endsAt: s.currentPeriodEnd?.toISOString() ?? null, by: "razorpay" });
        });
      return true;
    }
    default:
      return true;
  }
}
