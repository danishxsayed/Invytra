import { markVerifyPurchasePaid, type PrismaClient } from "@invytra/db";
import { AI_PACKS, VERIFY_PACKS, monthlyVerifyCredits, verifyBalance, verifyPack, type VerifyBalance } from "@invytra/shared";
import type { Result } from "./accounts";

/*
 * Email verification credits for the web app: the balance, and orders for extra packs.
 * Card payment arrives with billing; until then an order is saved as pending and the team
 * completes it (`pnpm credits:add`), which adds the credits.
 */

export async function getVerifyBalance(prisma: PrismaClient, workspaceId: string, now = new Date()): Promise<VerifyBalance> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, verifyUsed: true, verifyPeriod: true, verifyExtra: true } });
  return verifyBalance(ws, now);
}

export async function listVerifyOrders(prisma: PrismaClient, workspaceId: string, kind: "VERIFY" | "AI" = "VERIFY") {
  return prisma.verifyCreditPurchase.findMany({ where: { workspaceId, kind, status: { in: ["PENDING", "PAID"] } }, orderBy: { createdAt: "desc" }, take: 5 });
}

/** The pack (verification or AI) with this id. */
export function creditPack(packId: string) {
  const v = verifyPack(packId);
  if (v) return { ...v, kind: "VERIFY" as const };
  const a = AI_PACKS.find((p) => p.id === packId);
  return a ? { ...a, kind: "AI" as const } : null;
}

/** Saves an order for an extra pack (pending until paid). At most 3 open orders. */
export async function orderVerifyPack(prisma: PrismaClient, workspaceId: string, userId: string, packId: string): Promise<Result<{ id: string; credits: number; priceCents: number }>> {
  const pack = creditPack(packId);
  if (!pack) return { ok: false, error: "Choose a credit pack." };
  const open = await prisma.verifyCreditPurchase.count({ where: { workspaceId, status: "PENDING" } });
  if (open >= 3) return { ok: false, error: "You already have 3 orders waiting for payment." };
  const row = await prisma.verifyCreditPurchase.create({ data: { workspaceId, kind: pack.kind, credits: pack.credits, priceCents: pack.priceCents, requestedBy: userId } });
  return { ok: true, value: { id: row.id, credits: row.credits, priceCents: row.priceCents } };
}

/** Cancels one of the workspace's own pending orders. */
export async function cancelVerifyOrder(prisma: PrismaClient, workspaceId: string, orderId: string): Promise<Result> {
  const r = await prisma.verifyCreditPurchase.updateMany({ where: { id: orderId, workspaceId, status: "PENDING" }, data: { status: "CANCELLED" } });
  return r.count ? { ok: true, value: undefined } : { ok: false, error: "That order can't be cancelled." };
}

/**
 * Team use (CLI): adds verification or AI credits to a workspace. Completes its oldest pending order of that
 * size if there is one, else records a manual purchase. Returns the credits added.
 */
export async function addVerifyCredits(prisma: PrismaClient, workspaceId: string, credits: number, paymentRef: string | null, now = new Date(), kind: "VERIFY" | "AI" = "VERIFY"): Promise<number> {
  const order = await prisma.verifyCreditPurchase.findFirst({ where: { workspaceId, kind, status: "PENDING", credits }, orderBy: { createdAt: "asc" } });
  const pack = (kind === "AI" ? AI_PACKS : VERIFY_PACKS).find((p) => p.credits === credits);
  const id = order?.id ?? (await prisma.verifyCreditPurchase.create({ data: { workspaceId, kind, credits, priceCents: pack?.priceCents ?? 0 } })).id;
  return markVerifyPurchasePaid(prisma, id, paymentRef ?? "manual", now);
}

export { monthlyVerifyCredits };
