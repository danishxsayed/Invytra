import { RazorpayClient, RazorpayError, checkoutSignatureOk, completePurchase, razorpayKeys, webhookSignatureOk, type InvoiceSnapshot, type PrismaClient, type RazorpayKeys } from "@invytra/db";
import { TRIAL, channelById } from "@invytra/shared";
import { z } from "zod";
import type { Result } from "./accounts";
import { orderVerifyPack } from "./verify-credits";

/*
 * Billing for the whole workspace (every channel): plan, payments, invoices, billing details,
 * and paying for credit packs with Razorpay. Owner only: the pages and actions check it.
 * Plans (upgrade, downgrade, renew, cancel) arrive with the final pricing.
 */

const DAY = 86_400_000;

export function planOf(ws: { plan: string; createdAt: Date; channels: string[] }, now = new Date()) {
  const trial = ws.plan === "trial";
  const trialEnds = new Date(ws.createdAt.getTime() + TRIAL.days * DAY);
  return {
    id: ws.plan,
    name: trial ? "Free trial" : ws.plan.charAt(0).toUpperCase() + ws.plan.slice(1),
    trial,
    trialEnds: trial ? trialEnds : null,
    trialDaysLeft: trial ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / DAY)) : null,
    channels: ws.channels.map((c) => channelById(c as never)?.name ?? c),
  };
}

/** Every payment (credit packs so far), newest first. */
export async function listPayments(prisma: PrismaClient, workspaceId: string) {
  const rows = await prisma.verifyCreditPurchase.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({
    id: r.id,
    what: `${r.credits.toLocaleString("en-US")} ${r.kind === "AI" ? "AI" : "email verification"} credits`,
    amountCents: r.priceCents,
    currency: r.currency,
    status: r.status,
    method: r.method,
    createdAt: r.createdAt,
    paidAt: r.paidAt,
    invoiceNumber: r.invoiceNumber,
  }));
}

/** One paid payment's invoice, only from this workspace. */
export async function getInvoice(prisma: PrismaClient, workspaceId: string, id: string) {
  const r = await prisma.verifyCreditPurchase.findFirst({ where: { id, workspaceId, status: "PAID", invoiceNumber: { not: null } } });
  if (!r) return null;
  return { number: r.invoiceNumber!, paidAt: r.paidAt!, method: r.method, paymentRef: r.paymentRef, snapshot: r.invoice as unknown as InvoiceSnapshot };
}

export const billingProfileSchema = z.object({
  legalName: z.string().trim().min(2, "Enter the company or person to bill.").max(120),
  email: z.string().trim().email("Enter a valid billing email.").max(200),
  addressLine1: z.string().trim().min(3, "Enter the street address.").max(200),
  addressLine2: z.string().trim().max(200).optional().transform((v) => v || null),
  city: z.string().trim().min(1, "Enter the city.").max(100),
  state: z.string().trim().max(100).optional().transform((v) => v || null),
  postalCode: z.string().trim().max(20).optional().transform((v) => v || null),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country."),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => v || null)
    .refine((v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "That GSTIN doesn't look right (15 characters, like 29ABCDE1234F1Z5)."),
});
export type BillingProfileInput = z.input<typeof billingProfileSchema>;

export async function saveBillingProfile(prisma: PrismaClient, workspaceId: string, input: unknown): Promise<Result> {
  const p = billingProfileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  if (p.data.gstin && p.data.country !== "IN") return { ok: false, error: "A GSTIN is only for businesses in India." };
  await prisma.billingProfile.upsert({ where: { workspaceId }, create: { workspaceId, ...p.data }, update: p.data });
  return { ok: true, value: undefined };
}

export type Checkout =
  | { kind: "razorpay"; purchaseId: string; keyId: string; orderId: string; amount: number; currency: string; description: string }
  | { kind: "manual"; purchaseId: string; credits: number; priceCents: number };

/**
 * Starts paying for a credit pack: saves the order and, when Razorpay is set up, opens a
 * Razorpay order for the checkout. Without Razorpay the order waits for the team (as before).
 */
export async function startPackCheckout(prisma: PrismaClient, workspaceId: string, userId: string, packId: string, keys: RazorpayKeys | null = razorpayKeys(), client?: RazorpayClient): Promise<Result<Checkout>> {
  const order = await orderVerifyPack(prisma, workspaceId, userId, packId);
  if (!order.ok) return order;
  const { id, credits, priceCents } = order.value;
  if (!keys) return { ok: true, value: { kind: "manual", purchaseId: id, credits, priceCents } };
  const row = await prisma.verifyCreditPurchase.findUniqueOrThrow({ where: { id } });
  try {
    const rp = await (client ?? new RazorpayClient(keys)).createOrder({ amount: priceCents, currency: row.currency, receipt: id, notes: { workspaceId, purchaseId: id } });
    await prisma.verifyCreditPurchase.update({ where: { id }, data: { razorpayOrderId: rp.id } });
    const description = `${credits.toLocaleString("en-US")} ${row.kind === "AI" ? "AI" : "email verification"} credits`;
    return { ok: true, value: { kind: "razorpay", purchaseId: id, keyId: keys.keyId, orderId: rp.id, amount: rp.amount, currency: rp.currency, description } };
  } catch (e) {
    await prisma.verifyCreditPurchase.update({ where: { id }, data: { status: "CANCELLED" } });
    return { ok: false, error: e instanceof RazorpayError ? e.message : "Couldn't reach the payment service. Please try again." };
  }
}

/** The checkout says it's paid: checked against Razorpay's signature before any credits are added. */
export async function confirmCheckout(
  prisma: PrismaClient,
  workspaceId: string,
  input: { purchaseId: string; orderId: string; paymentId: string; signature: string },
  keys: RazorpayKeys | null = razorpayKeys(),
  client?: RazorpayClient,
): Promise<Result<{ credits: number }>> {
  if (!keys) return { ok: false, error: "Payments aren't set up." };
  const row = await prisma.verifyCreditPurchase.findFirst({ where: { id: input.purchaseId, workspaceId, razorpayOrderId: input.orderId } });
  if (!row || !checkoutSignatureOk(keys.keySecret, input.orderId, input.paymentId, input.signature)) return { ok: false, error: "We couldn't confirm this payment. If you were charged, it will be added automatically within a few minutes." };
  const method = await (client ?? new RazorpayClient(keys))
    .payment(input.paymentId)
    .then((p) => p.method ?? null)
    .catch(() => null);
  const credits = await completePurchase(prisma, row.id, { ref: input.paymentId, method });
  return { ok: true, value: { credits: credits || row.credits } };
}

/**
 * Razorpay's webhook (order.paid / payment.captured): completes the payment even when the
 * browser closed before the checkout came back. false = the signature didn't match.
 */
export async function handleRazorpayWebhook(prisma: PrismaClient, rawBody: string, signature: string, keys: RazorpayKeys | null = razorpayKeys()): Promise<boolean> {
  if (!keys?.webhookSecret || !signature || !webhookSignatureOk(keys.webhookSecret, rawBody, signature)) return false;
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; method?: string; status?: string } }; order?: { entity?: { id?: string } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return true;
  }
  if (event.event !== "order.paid" && event.event !== "payment.captured") return true;
  const pay = event.payload?.payment?.entity;
  const orderId = event.payload?.order?.entity?.id ?? pay?.order_id;
  if (!orderId || !pay?.id) return true;
  const row = await prisma.verifyCreditPurchase.findUnique({ where: { razorpayOrderId: orderId } });
  if (row) await completePurchase(prisma, row.id, { ref: pay.id, method: pay.method ?? null });
  return true;
}
