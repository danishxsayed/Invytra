import { recordSubscriptionEvent, type PrismaClient } from "@invytra/db";
import {
  PLAN_CHANNELS,
  SENDER_LABEL,
  canSend,
  channelById,
  effectiveStatus,
  notSendingMessage,
  planById,
  senderCounts,
  senderLimit,
  type BillingCycle,
  type PlanChannel,
  type PlanChoice,
  type SubscriptionLike,
  type SubscriptionStatus,
} from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * Plans for the web app: what a workspace may do (send, connect senders, use channels), the
 * checks the server makes before it does any of it, the trial's channel, and what the
 * billing page shows. Rules and prices: @invytra/shared pricing.ts. Buying and changing:
 * plan-checkout.ts; Razorpay's notices: plan-webhook.ts.
 */

type Sub = NonNullable<Awaited<ReturnType<typeof readSubscription>>>;

export const readSubscription = (prisma: PrismaClient, workspaceId: string) => prisma.subscription.findUnique({ where: { workspaceId } });

/** The workspace's subscription, as the rules see it (null = an old workspace with no plan row: no limits). */
export async function subscriptionOf(prisma: PrismaClient, workspaceId: string): Promise<SubscriptionLike | null> {
  return readSubscription(prisma, workspaceId);
}

/** null when the workspace may send; otherwise why not (shown to the user). */
export async function sendingProblem(prisma: PrismaClient, workspaceId: string, now = new Date()): Promise<string | null> {
  const s = await subscriptionOf(prisma, workspaceId);
  if (!s || canSend(s, now)) return null;
  return notSendingMessage(s);
}

/** Sender accounts in use, per channel. */
export async function sendersInUse(prisma: PrismaClient, workspaceId: string): Promise<Record<PlanChannel, number>> {
  const [linkedin, email] = await Promise.all([prisma.linkedinAccount.count({ where: { workspaceId } }), prisma.emailAccount.count({ where: { workspaceId } })]);
  return { linkedin, email, whatsapp: 0 };
}

/** null when one more sender may be connected on this channel; otherwise why not. */
export async function senderProblem(prisma: PrismaClient, workspaceId: string, channel: PlanChannel): Promise<string | null> {
  const s = await subscriptionOf(prisma, workspaceId);
  if (!s) return null;
  const label = SENDER_LABEL[channel];
  if (!s.channels.includes(channel)) return `Your plan doesn't include ${channelById(channel)?.name ?? channel}. Upgrade your plan to use it.`;
  const limit = senderLimit(s, channel);
  const used = (await sendersInUse(prisma, workspaceId))[channel];
  if (used < limit) return null;
  if (s.plan === "trial") return `The free trial includes one ${label.one}. Upgrade your plan to connect more.`;
  return `Your plan includes ${limit} ${limit === 1 ? label.one : label.many}, and ${used === 1 ? "it's" : "they're all"} in use. Add more ${label.many} on the Billing page.`;
}

/* ---------- The trial ---------- */

/** Onboarding: the one channel the free trial uses (only while trialing; live channels only). */
export async function setTrialChannel(prisma: PrismaClient, workspaceId: string, channel: string): Promise<Result> {
  const s = await readSubscription(prisma, workspaceId);
  if (!s || s.plan !== "trial") return { ok: true, value: undefined };
  const def = channelById(channel);
  if (!def || def.status !== "live" || !(PLAN_CHANNELS as readonly string[]).includes(channel)) return { ok: false, error: "Choose LinkedIn or Email for your free trial." };
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { workspaceId }, data: { channels: [channel] } });
    await tx.workspace.update({ where: { id: workspaceId }, data: { channels: [channel] } });
    await recordSubscriptionEvent(tx, workspaceId, "trial_channel", { channel });
  });
  return { ok: true, value: undefined };
}

/* ---------- What the billing page shows ---------- */

export interface PlanView {
  plan: string;
  name: string;
  status: SubscriptionStatus;
  cycle: BillingCycle | null;
  channels: PlanChannel[];
  extra: Partial<Record<PlanChannel, number>>;
  limits: Record<PlanChannel, number>;
  used: Record<PlanChannel, number>;
  credits: number;
  priceCents: number;
  trialEndsAt: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  paymentFailed: boolean;
  canSend: boolean;
  pending: { choice: PlanChoice; priceCents: number; at: string } | null;
  /** Paid through Razorpay (changes go through it). */
  renewsAutomatically: boolean;
}

export async function planView(prisma: PrismaClient, workspaceId: string, now = new Date()): Promise<PlanView> {
  const [s, used, ws] = await Promise.all([readSubscription(prisma, workspaceId), sendersInUse(prisma, workspaceId), prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { channels: true, aiMonthly: true, createdAt: true } })]);
  const sub: SubscriptionLike & Partial<Sub> = s ?? { plan: "vip", status: "ACTIVE", channels: ws.channels, extraSenders: {}, trialEndsAt: null, currentPeriodEnd: null };
  const status = effectiveStatus(sub, now);
  const channels = PLAN_CHANNELS.filter((c) => sub.channels.includes(c));
  return {
    plan: sub.plan,
    name: planById(sub.plan).name,
    status,
    cycle: (s?.billingCycle as BillingCycle | null) ?? null,
    channels,
    extra: senderCounts(sub.extraSenders),
    limits: { linkedin: s ? senderLimit(sub, "linkedin") : 999, email: s ? senderLimit(sub, "email") : 999, whatsapp: s ? senderLimit(sub, "whatsapp") : 999 },
    used,
    credits: s?.monthlyCredits ?? ws.aiMonthly,
    priceCents: s?.priceCents ?? 0,
    trialEndsAt: s?.trialEndsAt ?? null,
    periodEnd: s?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: !!s?.cancelAtPeriodEnd,
    paymentFailed: s?.paymentStatus === "FAILED",
    canSend: canSend(sub, now),
    pending: (s?.pendingChange as PlanView["pending"]) ?? null,
    renewsAutomatically: !!s?.razorpaySubscriptionId && status !== "EXPIRED",
  };
}

export async function subscriptionHistory(prisma: PrismaClient, workspaceId: string) {
  return prisma.subscriptionEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 30 });
}

