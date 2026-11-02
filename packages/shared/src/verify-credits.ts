/*
 * Email verification credits. One credit = one deep (mailbox) check by the verification
 * service; the free checks (format, no mail servers, throwaway domains) cost nothing.
 * Each workspace gets a monthly allowance that resets on the 1st (UTC), then uses extra
 * credits it bought, which never expire.
 */

export const VERIFY_CREDITS = {
  /** Every paid plan, each month. */
  paidMonthly: 1000,
  /** The free trial, each month: enough to try it. */
  trialMonthly: 100,
} as const;

export interface VerifyPack {
  id: string;
  credits: number;
  /** Price in US cents. */
  priceCents: number;
}

/** Extra credits to buy (they never expire). */
export const VERIFY_PACKS: readonly VerifyPack[] = [
  { id: "5k", credits: 5_000, priceCents: 750 },
  { id: "10k", credits: 10_000, priceCents: 1_400 },
  { id: "25k", credits: 25_000, priceCents: 3_000 },
];

export const verifyPack = (id: string) => VERIFY_PACKS.find((p) => p.id === id) ?? null;

export const monthlyVerifyCredits = (plan: string) => (plan === "trial" ? VERIFY_CREDITS.trialMonthly : VERIFY_CREDITS.paidMonthly);

/** Start of the credit month (the 1st, 00:00 UTC). */
export const creditMonthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
export const creditMonthEnd = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

export interface VerifyBalance {
  monthly: number;
  monthlyUsed: number;
  monthlyLeft: number;
  extra: number;
  /** All credits usable right now. */
  left: number;
  resetsAt: Date;
}

/** What a workspace can still use (a used count from an earlier month counts as 0). */
export function verifyBalance(ws: { plan: string; verifyUsed: number; verifyPeriod: Date | null; verifyExtra: number }, now: Date): VerifyBalance {
  const monthly = monthlyVerifyCredits(ws.plan);
  const used = ws.verifyPeriod && ws.verifyPeriod >= creditMonthStart(now) ? ws.verifyUsed : 0;
  const monthlyLeft = Math.max(0, monthly - used);
  const extra = Math.max(0, ws.verifyExtra);
  return { monthly, monthlyUsed: Math.min(used, monthly), monthlyLeft, extra, left: monthlyLeft + extra, resetsAt: creditMonthEnd(now) };
}

/** "$7.50" */
export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
