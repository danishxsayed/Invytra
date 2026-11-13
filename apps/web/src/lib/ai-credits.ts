import { refundAiCredits, spendAiCredits, type AiSpend, type PrismaClient } from "@invytra/db";
import { AI_ACTION_LABEL, AI_COSTS, aiBalance, type AiAction, type AiBalance } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * AI credits for the web app: the balance, recent usage, and charging an action before the
 * AI runs (with a refund when it fails, so a failed draft never costs anything).
 */

export async function getAiBalance(prisma: PrismaClient, workspaceId: string, now = new Date()): Promise<AiBalance> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, aiUsed: true, aiPeriod: true, aiExtra: true, aiMonthly: true } });
  return aiBalance(ws, now);
}

/** Credits used this month, per kind of action ("Voice note: 12 × = 60 credits"). */
export async function aiUsageThisMonth(prisma: PrismaClient, workspaceId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await prisma.aiCreditUse.groupBy({ by: ["action"], where: { workspaceId, createdAt: { gte: start } }, _sum: { credits: true }, _count: true });
  return (Object.keys(AI_COSTS) as AiAction[]).map((a) => {
    const r = rows.find((x) => x.action === a);
    return { action: a, label: AI_ACTION_LABEL[a], cost: AI_COSTS[a], times: r?._count ?? 0, credits: r?._sum.credits ?? 0 };
  });
}

export const outOfAiCredits = (need: number) =>
  `You're out of AI credits (this needs ${need}). Buy more on the Credits page, or wait for next month's credits.`;

/** Takes the credits for one action; the error explains when there aren't enough. */
export async function chargeAi(prisma: PrismaClient, workspaceId: string, action: AiAction, ref?: string): Promise<Result<AiSpend>> {
  const need = AI_COSTS[action];
  const s = await spendAiCredits(prisma, workspaceId, need, action, null, { ref });
  return s ? { ok: true, value: s } : { ok: false, error: outOfAiCredits(need) };
}

export const refundAi = (prisma: PrismaClient, workspaceId: string, spend: AiSpend) => refundAiCredits(prisma, workspaceId, spend);
