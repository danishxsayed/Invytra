import type { PrismaClient } from "@prisma/client";

/*
 * Spending email verification credits, safely when several checks run at once: each spend is
 * one conditional UPDATE, so two checks can never both take the last credit.
 * The monthly allowance comes from the caller (it depends on the plan).
 */

export type CreditSource = "monthly" | "extra";
const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Starts a new credit month if the stored one is older. */
async function rollMonth(prisma: PrismaClient, workspaceId: string, now: Date) {
  const start = monthStart(now);
  await prisma.workspace.updateMany({ where: { id: workspaceId, OR: [{ verifyPeriod: null }, { verifyPeriod: { lt: start } }] }, data: { verifyPeriod: start, verifyUsed: 0 } });
}

/** Takes one credit (this month's first, then extra); null = none left. */
export async function spendVerifyCredit(prisma: PrismaClient, workspaceId: string, monthlyFor: (plan: string) => number, now = new Date()): Promise<CreditSource | null> {
  await rollMonth(prisma, workspaceId, now);
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } });
  if (!ws) return null;
  const monthly = await prisma.workspace.updateMany({ where: { id: workspaceId, verifyUsed: { lt: monthlyFor(ws.plan) } }, data: { verifyUsed: { increment: 1 } } });
  if (monthly.count) return "monthly";
  const extra = await prisma.workspace.updateMany({ where: { id: workspaceId, verifyExtra: { gt: 0 } }, data: { verifyExtra: { decrement: 1 } } });
  return extra.count ? "extra" : null;
}

/** Gives a credit back (the service didn't answer, so nothing was checked). */
export async function refundVerifyCredit(prisma: PrismaClient, workspaceId: string, from: CreditSource): Promise<void> {
  if (from === "extra") await prisma.workspace.update({ where: { id: workspaceId }, data: { verifyExtra: { increment: 1 } } });
  else await prisma.workspace.updateMany({ where: { id: workspaceId, verifyUsed: { gt: 0 } }, data: { verifyUsed: { decrement: 1 } } });
}

/** Credits usable right now. */
export async function verifyCreditsLeft(prisma: PrismaClient, workspaceId: string, monthlyFor: (plan: string) => number, now = new Date()): Promise<number> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, verifyUsed: true, verifyPeriod: true, verifyExtra: true } });
  if (!ws) return 0;
  const used = ws.verifyPeriod && ws.verifyPeriod >= monthStart(now) ? ws.verifyUsed : 0;
  return Math.max(0, monthlyFor(ws.plan) - used) + Math.max(0, ws.verifyExtra);
}

/**
 * Marks a purchase paid and adds its credits (verification or AI, by its kind), once (a second call changes nothing).
 * Returns the credits added (0 if it was already paid or cancelled).
 */
export async function markVerifyPurchasePaid(prisma: PrismaClient, purchaseId: string, paymentRef: string | null, now = new Date()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.verifyCreditPurchase.updateMany({ where: { id: purchaseId, status: "PENDING" }, data: { status: "PAID", paidAt: now, paymentRef } });
    if (!p.count) return 0;
    const row = await tx.verifyCreditPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    await tx.workspace.update({ where: { id: row.workspaceId }, data: row.kind === "AI" ? { aiExtra: { increment: row.credits } } : { verifyExtra: { increment: row.credits } } });
    return row.credits;
  });
}
