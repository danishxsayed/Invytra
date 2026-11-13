import type { Prisma, PrismaClient } from "@prisma/client";
import { sellerFromEnv, type InvoiceSnapshot, type Seller } from "./billing.js";

/*
 * The database side of plans: writing a workspace's plan (and keeping Workspace.plan,
 * channels and the monthly allowances in step), expiring, pausing campaigns, the history,
 * and invoices for plan payments. The rules (prices, limits) are in @invytra/shared
 * pricing.ts and are applied by the callers (web app, worker).
 */

type Tx = Prisma.TransactionClient | PrismaClient;

/** Verification credits each month on a paid plan, and on the trial. */
export const PAID_VERIFY_MONTHLY = 1000;
export const TRIAL_VERIFY_MONTHLY = 100;

export async function recordSubscriptionEvent(tx: Tx, workspaceId: string, kind: string, detail?: Record<string, unknown>) {
  await tx.subscriptionEvent.create({ data: { workspaceId, kind, ...(detail && { detail: detail as Prisma.InputJsonValue }) } });
}

/** A new workspace's free trial (one channel is chosen at onboarding; until then both live ones). */
export async function startTrial(tx: Tx, workspaceId: string, opts: { days: number; credits: number; channels: string[]; now?: Date }) {
  const now = opts.now ?? new Date();
  await tx.subscription.create({
    data: {
      workspaceId,
      plan: "trial",
      status: "TRIALING",
      channels: opts.channels,
      monthlyCredits: opts.credits,
      trialStartedAt: now,
      trialEndsAt: new Date(now.getTime() + opts.days * 86_400_000),
    },
  });
  await tx.workspace.update({ where: { id: workspaceId }, data: { plan: "trial", channels: opts.channels, aiMonthly: opts.credits, verifyMonthly: TRIAL_VERIFY_MONTHLY } });
  await recordSubscriptionEvent(tx, workspaceId, "trial_started", { channels: opts.channels, endsAt: new Date(now.getTime() + opts.days * 86_400_000).toISOString() });
}

export interface PlanValues {
  plan: string;
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING";
  billingCycle: string | null;
  channels: string[];
  extraSenders: Record<string, number>;
  customSenders?: Record<string, number> | null;
  monthlyCredits: number;
  verifyMonthly?: number;
  priceCents: number;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  razorpaySubscriptionId?: string | null;
  paymentStatus?: string | null;
}

/** Writes a plan and keeps the workspace's own copies (plan, channels, allowances) in step. */
export async function writePlan(tx: Tx, workspaceId: string, v: PlanValues, now = new Date()) {
  const data = {
    plan: v.plan,
    status: v.status,
    billingCycle: v.billingCycle,
    channels: v.channels,
    extraSenders: v.extraSenders as Prisma.InputJsonValue,
    customSenders: (v.customSenders ?? null) as Prisma.InputJsonValue,
    monthlyCredits: v.monthlyCredits,
    priceCents: v.priceCents,
    cancelAtPeriodEnd: v.status === "CANCELLED",
    pendingChange: null as unknown as Prisma.InputJsonValue,
    ...(v.currentPeriodStart !== undefined && { currentPeriodStart: v.currentPeriodStart }),
    ...(v.currentPeriodEnd !== undefined && { currentPeriodEnd: v.currentPeriodEnd }),
    ...(v.razorpaySubscriptionId !== undefined && { razorpaySubscriptionId: v.razorpaySubscriptionId }),
    ...(v.paymentStatus !== undefined && { paymentStatus: v.paymentStatus }),
  };
  await tx.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data, startedAt: now },
    update: { ...data, startedAt: undefined },
  });
  await tx.subscription.updateMany({ where: { workspaceId, startedAt: null, plan: { not: "trial" } }, data: { startedAt: now } });
  await tx.workspace.update({
    where: { id: workspaceId },
    data: { plan: v.plan, channels: v.channels, aiMonthly: v.monthlyCredits, verifyMonthly: v.verifyMonthly ?? (v.plan === "trial" ? TRIAL_VERIFY_MONTHLY : PAID_VERIFY_MONTHLY) },
  });
}

/** Stops every running campaign of the workspace (the plan ended): they wait, paused, for an upgrade. */
export async function pauseAllCampaigns(tx: Tx, workspaceId: string): Promise<number> {
  const li = await tx.campaign.updateMany({ where: { workspaceId, status: "ACTIVE" }, data: { status: "PAUSED" } });
  const em = await tx.emailCampaign.updateMany({ where: { workspaceId, status: { in: ["ACTIVE", "SCHEDULED"] } }, data: { status: "PAUSED" } });
  return li.count + em.count;
}

/** Ends a trial or a plan: no sending, no monthly credits; everything stays to look at. */
export async function expireSubscription(prisma: PrismaClient, workspaceId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.subscription.updateMany({ where: { workspaceId, status: { not: "EXPIRED" } }, data: { status: "EXPIRED", cancelAtPeriodEnd: false, pendingChange: null as unknown as Prisma.InputJsonValue } });
    if (!moved.count) return false;
    await tx.workspace.update({ where: { id: workspaceId }, data: { aiMonthly: 0, verifyMonthly: 0 } });
    const paused = await pauseAllCampaigns(tx, workspaceId);
    await recordSubscriptionEvent(tx, workspaceId, "expired", { reason, campaignsPaused: paused });
    return true;
  });
}

/** Trials past their 7 days and cancelled plans past their paid period: expired now. Returns how many. */
export async function expireDueSubscriptions(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.subscription.findMany({
    where: {
      OR: [
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "CANCELLED", currentPeriodEnd: { lte: now } },
      ],
    },
    select: { workspaceId: true, status: true },
    take: 200,
  });
  let n = 0;
  for (const s of due) if (await expireSubscription(prisma, s.workspaceId, s.status === "TRIALING" ? "trial ended" : "cancelled plan ended")) n++;
  return n;
}

/**
 * An invoice for a plan payment (first payment, renewal or upgrade). Once per Razorpay payment:
 * telling us twice changes nothing. Returns the invoice row's id, or null if it existed.
 */
export async function recordPlanPayment(
  prisma: PrismaClient,
  workspaceId: string,
  p: { paymentId: string; amountCents: number; currency: string; method?: string | null; description: string; orderId?: string | null },
  seller: Seller = sellerFromEnv(),
  now = new Date(),
): Promise<string | null> {
  if (await prisma.verifyCreditPurchase.findUnique({ where: { razorpayPaymentId: p.paymentId }, select: { id: true } })) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      const counter = await tx.invoiceCounter.upsert({ where: { id: 1 }, create: { id: 1, last: 1001 }, update: { last: { increment: 1 } } });
      const bp = await tx.billingProfile.findUnique({ where: { workspaceId } });
      const invoice: InvoiceSnapshot = {
        seller,
        billedTo: bp
          ? {
              legalName: bp.legalName,
              email: bp.email,
              address: [bp.addressLine1, bp.addressLine2, [bp.city, bp.state, bp.postalCode].filter(Boolean).join(", ")].filter((x): x is string => !!x),
              country: bp.country,
              ...(bp.gstin && { gstin: bp.gstin }),
            }
          : null,
        lines: [{ description: p.description, amountCents: p.amountCents }],
        currency: p.currency,
        totalCents: p.amountCents,
      };
      const row = await tx.verifyCreditPurchase.create({
        data: {
          workspaceId,
          kind: "PLAN",
          credits: 0,
          priceCents: p.amountCents,
          currency: p.currency,
          status: "PAID",
          paidAt: now,
          paymentRef: p.paymentId,
          razorpayPaymentId: p.paymentId,
          razorpayOrderId: p.orderId ?? null,
          method: p.method ?? null,
          description: p.description,
          invoiceNumber: `INV-${now.getUTCFullYear()}-${String(counter.last).padStart(5, "0")}`,
          invoice: invoice as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return row.id;
    });
  } catch (e) {
    // The same payment recorded at the same moment by the other path (checkout and webhook).
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}
