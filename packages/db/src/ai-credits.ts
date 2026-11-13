import type { PrismaClient } from "@prisma/client";

/*
 * Spending AI credits. One action can cost several credits (a voice note is 5), so the
 * workspace row is locked for the moment of the spend: two actions can never both take the
 * last credits, and a spend never takes part of what it needs. The monthly allowance is the
 * workspace's own (ai_monthly, set by its plan); tests can pass one instead.
 */

export interface AiSpend {
  fromMonthly: number;
  fromExtra: number;
  useId: string;
}
const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Takes `amount` credits (this month's first, then extra) and records what used them; null = not enough left. */
export async function spendAiCredits(
  prisma: PrismaClient,
  workspaceId: string,
  amount: number,
  action: string,
  monthlyFor?: ((plan: string) => number) | null,
  opts: { ref?: string; now?: Date } = {},
): Promise<AiSpend | null> {
  const now = opts.now ?? new Date();
  const start = monthStart(now);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ plan: string; ai_used: number; ai_period: Date | null; ai_extra: number; ai_monthly: number }[]>`
      SELECT "plan", "ai_used", "ai_period", "ai_extra", "ai_monthly" FROM "workspaces" WHERE "id" = ${workspaceId} FOR UPDATE`;
    const w = rows[0];
    if (!w) return null;
    const used = w.ai_period && w.ai_period >= start ? w.ai_used : 0;
    const monthlyLeft = Math.max(0, (monthlyFor ? monthlyFor(w.plan) : w.ai_monthly) - used);
    if (monthlyLeft + Math.max(0, w.ai_extra) < amount) return null;
    const fromMonthly = Math.min(monthlyLeft, amount);
    const fromExtra = amount - fromMonthly;
    await tx.workspace.update({ where: { id: workspaceId }, data: { aiPeriod: start, aiUsed: used + fromMonthly, aiExtra: { decrement: fromExtra } } });
    const use = await tx.aiCreditUse.create({ data: { workspaceId, action, credits: amount, ref: opts.ref ?? null, createdAt: now } });
    return { fromMonthly, fromExtra, useId: use.id };
  });
}

/** Gives credits back (the AI didn't deliver), and removes the usage entry. */
export async function refundAiCredits(prisma: PrismaClient, workspaceId: string, spend: AiSpend): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (spend.fromExtra) await tx.workspace.update({ where: { id: workspaceId }, data: { aiExtra: { increment: spend.fromExtra } } });
    if (spend.fromMonthly) {
      const w = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { aiUsed: true } });
      await tx.workspace.update({ where: { id: workspaceId }, data: { aiUsed: Math.max(0, (w?.aiUsed ?? 0) - spend.fromMonthly) } });
    }
    await tx.aiCreditUse.deleteMany({ where: { id: spend.useId } });
  });
}

/** Credits usable right now. */
export async function aiCreditsLeft(prisma: PrismaClient, workspaceId: string, monthlyFor?: ((plan: string) => number) | null, now = new Date()): Promise<number> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, aiUsed: true, aiPeriod: true, aiExtra: true, aiMonthly: true } });
  if (!ws) return 0;
  const used = ws.aiPeriod && ws.aiPeriod >= monthStart(now) ? ws.aiUsed : 0;
  return Math.max(0, (monthlyFor ? monthlyFor(ws.plan) : ws.aiMonthly) - used) + Math.max(0, ws.aiExtra);
}
