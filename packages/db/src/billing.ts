import type { Prisma, PrismaClient } from "@prisma/client";

/*
 * Completing a payment: marks it paid, adds its credits, gives it the next invoice number and
 * freezes who it was billed to (and by). Once only: completing it again changes nothing.
 */

export interface Seller {
  name: string;
  address?: string;
  gstin?: string;
  email?: string;
}

/** Who invoices are from (INVOICE_SELLER_* in .env). */
export function sellerFromEnv(env: NodeJS.ProcessEnv = process.env): Seller {
  return {
    name: env.INVOICE_SELLER_NAME?.trim() || "Crawlers Technologies Pvt Ltd",
    ...(env.INVOICE_SELLER_ADDRESS?.trim() && { address: env.INVOICE_SELLER_ADDRESS.trim() }),
    ...(env.INVOICE_SELLER_GSTIN?.trim() && { gstin: env.INVOICE_SELLER_GSTIN.trim() }),
    ...(env.INVOICE_SELLER_EMAIL?.trim() && { email: env.INVOICE_SELLER_EMAIL.trim() }),
  };
}

export interface InvoiceSnapshot {
  seller: Seller;
  billedTo: { legalName: string; email: string; address: string[]; country: string; gstin?: string } | null;
  lines: { description: string; amountCents: number }[];
  currency: string;
  totalCents: number;
}

const year = (d: Date) => d.getUTCFullYear();

/**
 * Completes a pending purchase (credit pack). Returns the credits added, or 0 when it was
 * already paid or cancelled.
 */
export async function completePurchase(
  prisma: PrismaClient,
  purchaseId: string,
  payment: { ref: string; method?: string | null },
  seller: Seller = sellerFromEnv(),
  now = new Date(),
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const done = await tx.verifyCreditPurchase.updateMany({ where: { id: purchaseId, status: "PENDING" }, data: { status: "PAID", paidAt: now, paymentRef: payment.ref, method: payment.method ?? null } });
    if (!done.count) return 0;
    const row = await tx.verifyCreditPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
    await tx.workspace.update({ where: { id: row.workspaceId }, data: row.kind === "AI" ? { aiExtra: { increment: row.credits } } : { verifyExtra: { increment: row.credits } } });
    const counter = await tx.invoiceCounter.upsert({ where: { id: 1 }, create: { id: 1, last: 1001 }, update: { last: { increment: 1 } } });
    const bp = await tx.billingProfile.findUnique({ where: { workspaceId: row.workspaceId } });
    const what = row.kind === "AI" ? "AI credits" : "Email verification credits";
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
      lines: [{ description: `${row.credits.toLocaleString("en-US")} ${what} (extra pack, never expire)`, amountCents: row.priceCents }],
      currency: row.currency,
      totalCents: row.priceCents,
    };
    await tx.verifyCreditPurchase.update({
      where: { id: row.id },
      data: { invoiceNumber: `INV-${year(now)}-${String(counter.last).padStart(5, "0")}`, invoice: invoice as unknown as Prisma.InputJsonValue },
    });
    return row.credits;
  });
}
