/*
 * AI credits: one shared balance for everything the AI makes, on every channel
 * (AI writer drafts, personalized notes, handwritten notes, voice notes, video notes).
 * Each workspace gets a monthly allowance that resets on the 1st (UTC), then uses extra
 * credits it bought, which never expire. Email verification has its own credits.
 */

import { creditMonthEnd, creditMonthStart, type VerifyPack } from "./verify-credits.js";

export const AI_CREDITS = {
  /** Every paid plan, each month. */
  paidMonthly: 500,
  /** The free trial, each month: enough to try every feature. */
  trialMonthly: 50,
} as const;

/** What each AI action costs, in credits. */
export const AI_COSTS = {
  TEXT: 1,
  NOTE: 1,
  HANDWRITTEN: 2,
  VOICE: 5,
  VIDEO: 15,
  // Ask Invy: per business shown.
  INVY: 1,
} as const;
export type AiAction = keyof typeof AI_COSTS;

export const AI_ACTION_LABEL: Record<AiAction, string> = {
  TEXT: "AI writer draft",
  NOTE: "Personalized note",
  HANDWRITTEN: "Handwritten note",
  VOICE: "Voice note",
  VIDEO: "Video note",
  INVY: "Ask Invy business",
};

/** Extra AI credits to buy (they never expire). */
export const AI_PACKS: readonly VerifyPack[] = [
  { id: "ai2k", credits: 2_000, priceCents: 1_000 },
  { id: "ai5k", credits: 5_000, priceCents: 2_200 },
];

export const monthlyAiCredits = (plan: string) => (plan === "trial" ? AI_CREDITS.trialMonthly : AI_CREDITS.paidMonthly);

export interface AiBalance {
  monthly: number;
  monthlyUsed: number;
  monthlyLeft: number;
  extra: number;
  left: number;
  resetsAt: Date;
}

export function aiBalance(ws: { plan: string; aiUsed: number; aiPeriod: Date | null; aiExtra: number }, now: Date): AiBalance {
  const monthly = monthlyAiCredits(ws.plan);
  const used = ws.aiPeriod && ws.aiPeriod >= creditMonthStart(now) ? ws.aiUsed : 0;
  const monthlyLeft = Math.max(0, monthly - used);
  const extra = Math.max(0, ws.aiExtra);
  return { monthly, monthlyUsed: Math.min(used, monthly), monthlyLeft, extra, left: monthlyLeft + extra, resetsAt: creditMonthEnd(now) };
}
