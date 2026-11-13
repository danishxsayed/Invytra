/*
 * Invytra's plans: a free trial, Starter, Growth and a custom VIP plan. One source of truth
 * for the pricing cards, checkout, the billing page and the server's checks (channels,
 * sender accounts, monthly credits). Prices are in US cents.
 *
 * - Trial: 7 days, 20 credits, ONE channel, one sender.
 * - Starter ($39): 250 credits a month, any TWO channels, one sender per channel.
 * - Growth ($49): 500 credits a month, all three channels, one sender per channel.
 * - VIP: custom price, credits, channels and sender limits (set by the team).
 * - Extra senders per channel are an add-on (LinkedIn $20, email mailbox $5 a month);
 *   a channel without a price here can't have extra senders yet.
 * - Yearly: 15% off twelve months, add-ons included.
 */

export type Currency = "USD";
export type BillingCycle = "monthly" | "yearly";

/** The channels plans are made of (WhatsApp counts even while it's on the way). */
export const PLAN_CHANNELS = ["linkedin", "email", "whatsapp"] as const;
export type PlanChannel = (typeof PLAN_CHANNELS)[number];
export const isPlanChannel = (c: string): c is PlanChannel => (PLAN_CHANNELS as readonly string[]).includes(c);

export const PLAN_IDS = ["trial", "starter", "growth", "vip"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PAID_PLANS = ["starter", "growth"] as const;
export type PaidPlanId = (typeof PAID_PLANS)[number];

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Per month, billed monthly (0 for the trial; null = custom). */
  monthlyCents: number | null;
  /** Credits each month (null = custom). */
  credits: number | null;
  /** How many of PLAN_CHANNELS it includes (null = custom). */
  channels: number | null;
  recommended?: boolean;
}

export const PLANS: Record<PlanId, PlanDef> = {
  trial: { id: "trial", name: "Free trial", monthlyCents: 0, credits: 20, channels: 1 },
  starter: { id: "starter", name: "Starter", monthlyCents: 3900, credits: 250, channels: 2 },
  growth: { id: "growth", name: "Growth", monthlyCents: 4900, credits: 500, channels: 3, recommended: true },
  vip: { id: "vip", name: "Custom VIP", monthlyCents: null, credits: null, channels: null },
};

export const planById = (id: string | null | undefined): PlanDef => PLANS[(PLAN_IDS as readonly string[]).includes(id ?? "") ? (id as PlanId) : "trial"];
export const isPaidPlan = (id: string): id is PaidPlanId => (PAID_PLANS as readonly string[]).includes(id);

/** The free trial. */
export const TRIAL = { days: 7, channels: 1, sendersPerChannel: 1, credits: 20, cardRequired: false, maxProfiles: 100 } as const;

/** Each extra sender account, per month, by channel (null = not sold yet). */
export const SENDER_ADDON_CENTS: Record<PlanChannel, number | null> = { linkedin: 2000, email: 500, whatsapp: null };
/** What a sender is on each channel, for labels. */
export const SENDER_LABEL: Record<PlanChannel, { one: string; many: string }> = {
  linkedin: { one: "LinkedIn sender", many: "LinkedIn senders" },
  email: { one: "email mailbox", many: "email mailboxes" },
  whatsapp: { one: "WhatsApp number", many: "WhatsApp numbers" },
};
/** Most extra senders one channel can add on a standard plan (more: VIP). */
export const MAX_EXTRA_SENDERS = 50;

/** Yearly billing: 15% off twelve months. */
export const YEARLY_DISCOUNT = 0.15;

export type SenderCounts = Partial<Record<PlanChannel, number>>;

export interface PlanChoice {
  plan: PaidPlanId;
  cycle: BillingCycle;
  /** Starter: exactly two; Growth: all three (filled in). */
  channels: PlanChannel[];
  /** Extra senders per channel, beyond the one included. */
  extra: SenderCounts;
}

export interface QuoteLine {
  label: string;
  /** Per billing period (after the yearly discount). */
  cents: number;
}

export interface PlanQuote {
  choice: PlanChoice;
  lines: QuoteLine[];
  /** Per month, before the yearly discount. */
  monthlyCents: number;
  /** What each billing period charges. */
  periodCents: number;
  /** The same period without the yearly discount (for the strikethrough). */
  listCents: number;
  savedCents: number;
}

const yearly = (monthly: number) => Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT));

/** Checks a plan choice and fills in what the plan decides (Growth's channels). */
export function normalizeChoice(input: { plan: string; cycle?: string; channels?: readonly string[]; extra?: Record<string, unknown> }): { ok: true; choice: PlanChoice } | { ok: false; error: string } {
  if (!isPaidPlan(input.plan)) return { ok: false, error: "Choose Starter or Growth (VIP is arranged with our team)." };
  const cycle: BillingCycle = input.cycle === "yearly" ? "yearly" : "monthly";
  const def = PLANS[input.plan];
  const picked = [...new Set((input.channels ?? []).filter(isPlanChannel))];
  const channels = input.plan === "growth" ? [...PLAN_CHANNELS] : picked;
  if (channels.length !== def.channels) return { ok: false, error: `${def.name} includes ${def.channels} channels: choose ${def.channels}.` };
  const extra: SenderCounts = {};
  for (const c of PLAN_CHANNELS) {
    const n = Math.floor(Number(input.extra?.[c] ?? 0));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!channels.includes(c)) return { ok: false, error: `Add ${SENDER_LABEL[c].many} only to a channel in your plan.` };
    if (SENDER_ADDON_CENTS[c] === null) return { ok: false, error: `Extra ${SENDER_LABEL[c].many} aren't available yet.` };
    if (n > MAX_EXTRA_SENDERS) return { ok: false, error: `Up to ${MAX_EXTRA_SENDERS} extra ${SENDER_LABEL[c].many} on this plan. For more, talk to us about VIP.` };
    extra[c] = n;
  }
  return { ok: true, choice: { plan: input.plan, cycle, channels: PLAN_CHANNELS.filter((c) => channels.includes(c)), extra } };
}

/** The price of a plan choice: base plan plus extra senders, monthly or yearly. */
export function quotePlan(choice: PlanChoice): PlanQuote {
  const per = (monthly: number) => (choice.cycle === "yearly" ? yearly(monthly) : monthly);
  const base = PLANS[choice.plan].monthlyCents!;
  const lines: QuoteLine[] = [{ label: `${PLANS[choice.plan].name} plan`, cents: per(base) }];
  let monthlyCents = base;
  for (const c of PLAN_CHANNELS) {
    const n = choice.extra[c] ?? 0;
    const price = SENDER_ADDON_CENTS[c];
    if (!n || price === null) continue;
    monthlyCents += n * price;
    lines.push({ label: `${n} extra ${n === 1 ? SENDER_LABEL[c].one : SENDER_LABEL[c].many}`, cents: per(n * price) });
  }
  const periodCents = lines.reduce((s, l) => s + l.cents, 0);
  const listCents = choice.cycle === "yearly" ? monthlyCents * 12 : monthlyCents;
  return { choice, lines, monthlyCents, periodCents, listCents, savedCents: listCents - periodCents };
}

/** "$39", "$397.80" */
export function formatMoney(cents: number, _currency: Currency = "USD"): string {
  const v = cents / 100;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/* ---------- What a workspace is entitled to ---------- */

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";

/** The parts of a subscription the rules below need. */
export interface SubscriptionLike {
  plan: string;
  status: string;
  channels: readonly string[];
  extraSenders: unknown;
  /** VIP: sender accounts per channel (replaces 1 + extra). */
  customSenders?: unknown;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

const counts = (v: unknown): SenderCounts => {
  const out: SenderCounts = {};
  if (v && typeof v === "object")
    for (const c of PLAN_CHANNELS) {
      const n = Math.floor(Number((v as Record<string, unknown>)[c] ?? 0));
      if (Number.isFinite(n) && n > 0) out[c] = n;
    }
  return out;
};
export const senderCounts = counts;

/** The status right now: a trial or a cancelled plan past its end has expired even before the nightly check marks it. */
export function effectiveStatus(s: SubscriptionLike, now = new Date()): SubscriptionStatus {
  if (s.status === "TRIALING" && s.trialEndsAt && s.trialEndsAt <= now) return "EXPIRED";
  if (s.status === "CANCELLED" && (!s.currentPeriodEnd || s.currentPeriodEnd <= now)) return "EXPIRED";
  return (["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"] as const).find((x) => x === s.status) ?? "EXPIRED";
}

/** Whether campaigns may send (and new ones start): trial running, plan paid up or in its retry window, or cancelled but not yet ended. */
export const canSend = (s: SubscriptionLike, now = new Date()) => effectiveStatus(s, now) !== "EXPIRED";

/** Sender accounts allowed on a channel: none if the plan doesn't include it. */
export function senderLimit(s: SubscriptionLike, channel: PlanChannel): number {
  if (!s.channels.includes(channel)) return 0;
  if (s.plan === "vip") {
    const custom = counts(s.customSenders)[channel];
    if (custom) return custom;
  }
  return 1 + (counts(s.extraSenders)[channel] ?? 0);
}

export const EXPIRED_MESSAGE = "Your free trial has expired. Upgrade your plan to continue using Invytra's outreach features.";
export const ENDED_MESSAGE = "Your plan has ended. Choose a plan to continue using Invytra's outreach features.";
/** Why sending is off, in the user's words. */
export const notSendingMessage = (s: SubscriptionLike) => (s.plan === "trial" ? EXPIRED_MESSAGE : ENDED_MESSAGE);
