/**
 * Invytra's price list: one price per connected LinkedIn account ("sender"),
 * cheaper per sender the more you have. The rate for your package applies to
 * every sender. The website shows it; billing (M6) charges it.
 */
export type Currency = "USD" | "INR";
export type Billing = "monthly" | "yearly";

export interface PriceTier {
  id: "solo" | "team" | "growth" | "agency" | "scale";
  name: string;
  minSenders: number;
  /** null = no upper bound */
  maxSenders: number | null;
  /** Per sender per month, billed monthly. INR excludes GST. */
  perSender: Record<Currency, number>;
  /** Above this many senders, prices are by quote. */
  quoteAbove?: number;
}

export const PRICE_TIERS: PriceTier[] = [
  { id: "solo", name: "Solo", minSenders: 1, maxSenders: 1, perSender: { USD: 29, INR: 2499 } },
  { id: "team", name: "Team", minSenders: 2, maxSenders: 9, perSender: { USD: 24, INR: 1999 } },
  { id: "growth", name: "Growth", minSenders: 10, maxSenders: 24, perSender: { USD: 19, INR: 1599 } },
  { id: "agency", name: "Agency", minSenders: 25, maxSenders: 49, perSender: { USD: 15, INR: 1249 } },
  { id: "scale", name: "Scale", minSenders: 50, maxSenders: null, perSender: { USD: 12, INR: 999 }, quoteAbove: 100 },
];

/** The free plan: 7 days, up to 3 senders, and up to 100 people collected from searches. */
export const TRIAL = { days: 7, maxSenders: 3, cardRequired: false, maxProfiles: 100 } as const;
/** Yearly billing: 12 months for the price of 10. */
export const YEARLY_MONTHS_PAID = 10;
/** Agency and Scale: bring your own proxies for this much less per sender per month. */
export const BYO_PROXY_DISCOUNT: Record<Currency, number> = { USD: 3, INR: 249 };

export function tierFor(senders: number): PriceTier {
  const n = Math.max(1, Math.floor(senders));
  return PRICE_TIERS.find((t) => n >= t.minSenders && (t.maxSenders === null || n <= t.maxSenders))!;
}

const round = (v: number, currency: Currency) => (currency === "USD" ? Math.round(v * 100) / 100 : Math.round(v));

export interface Quote {
  senders: number;
  tier: PriceTier;
  /** Per sender, per month (yearly billing shown as its monthly equivalent). */
  perSender: number;
  /** All senders, per month (monthly equivalent for yearly billing). */
  perMonth: number;
  /** What is actually charged each billing period. */
  charged: number;
  /** Fewer-than-next-package senders can cost more than the next package; this is that cheaper option. */
  betterDeal?: { senders: number; perMonth: number };
  /** Above the published tiers: price by quote. */
  quote: boolean;
}

export function priceFor(senders: number, { currency = "USD", billing = "monthly" }: { currency?: Currency; billing?: Billing } = {}): Quote {
  const n = Math.max(1, Math.floor(senders));
  const tier = tierFor(n);
  const factor = billing === "yearly" ? YEARLY_MONTHS_PAID / 12 : 1;
  const perSender = round(tier.perSender[currency] * factor, currency);
  const perMonth = round(perSender * n, currency);
  const charged = billing === "yearly" ? round(tier.perSender[currency] * n * YEARLY_MONTHS_PAID, currency) : perMonth;
  const next = PRICE_TIERS[PRICE_TIERS.indexOf(tier) + 1];
  let betterDeal: Quote["betterDeal"];
  if (next) {
    const nextMonth = round(round(next.perSender[currency] * factor, currency) * next.minSenders, currency);
    if (nextMonth <= perMonth) betterDeal = { senders: next.minSenders, perMonth: nextMonth };
  }
  return { senders: n, tier, perSender, perMonth, charged, betterDeal, quote: !!tier.quoteAbove && n > tier.quoteAbove };
}

export function formatMoney(amount: number, currency: Currency): string {
  return currency === "USD"
    ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: amount % 1 ? 2 : 0, minimumFractionDigits: amount % 1 ? 2 : 0 })}`
    : `₹${amount.toLocaleString("en-IN")}`;
}
