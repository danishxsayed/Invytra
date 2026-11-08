/**
 * Billing against a real database (only with TEST_DATABASE_URL — it is wiped): credit pack
 * checkout with Razorpay, signature checks, the webhook, invoice numbers, billing details.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, RazorpayClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmCheckout, getInvoice, handleRazorpayWebhook, listPayments, saveBillingProfile, startPackCheckout } from "../src/lib/billing";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const keys = { keyId: "rzp_test_k", keySecret: "sec", webhookSecret: "wh" };
const sign = (orderId: string, paymentId: string) => createHmac("sha256", "sec").update(`${orderId}|${paymentId}`).digest("hex");

d("billing", () => {
  let prisma: PrismaClient;
  const A = "ws-bill-a";
  const B = "ws-bill-b";
  let n = 0;
  const fake = new RazorpayClient(keys, (async (u: string) =>
    u.includes("/orders")
      ? new Response(JSON.stringify({ id: `order_${++n}`, amount: 1000, currency: "USD", status: "created" }))
      : new Response(JSON.stringify({ id: "pay", order_id: "x", status: "captured", method: "upi", amount: 1000, currency: "USD" }))) as unknown as typeof fetch);
  const extra = (id: string) => prisma.workspace.findUniqueOrThrow({ where: { id } }).then((w) => w.aiExtra);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme", plan: "pro" }, { id: B, name: "Other" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("saves billing details, checking the GSTIN", async () => {
    const base = { legalName: "Acme Pvt Ltd", email: "billing@acme.in", addressLine1: "12 MG Road", city: "Hubballi", state: "Karnataka", postalCode: "580020", country: "IN" };
    expect(await saveBillingProfile(prisma, A, { ...base, gstin: "29ABCDE1234F1Z5" })).toEqual({ ok: true, value: undefined });
    expect(await saveBillingProfile(prisma, A, { ...base, gstin: "123" })).toMatchObject({ ok: false, error: expect.stringMatching(/GSTIN/) });
    expect(await saveBillingProfile(prisma, A, { ...base, country: "US", gstin: "29ABCDE1234F1Z5" })).toMatchObject({ ok: false, error: expect.stringMatching(/only for businesses in India/) });
    expect(await saveBillingProfile(prisma, A, { ...base, email: "nope" })).toMatchObject({ ok: false });
  });

  it("without Razorpay, an order waits for the team", async () => {
    const r = await startPackCheckout(prisma, A, "u1", "ai2k", null);
    expect(r).toMatchObject({ ok: true, value: { kind: "manual", credits: 2000 } });
  });

  it("pays a pack through Razorpay: only a valid signature adds credits, once, with an invoice", async () => {
    const r = await startPackCheckout(prisma, A, "u1", "ai2k", keys, fake);
    if (!r.ok || r.value.kind !== "razorpay") throw new Error("expected a Razorpay checkout");
    const { purchaseId, orderId } = r.value;
    expect(r.value).toMatchObject({ keyId: "rzp_test_k", amount: 1000, currency: "USD" });
    const before = await extra(A);

    expect(await confirmCheckout(prisma, A, { purchaseId, orderId, paymentId: "pay_1", signature: "forged" }, keys, fake)).toMatchObject({ ok: false });
    expect(await confirmCheckout(prisma, B, { purchaseId, orderId, paymentId: "pay_1", signature: sign(orderId, "pay_1") }, keys, fake)).toMatchObject({ ok: false });
    expect(await extra(A)).toBe(before);

    expect(await confirmCheckout(prisma, A, { purchaseId, orderId, paymentId: "pay_1", signature: sign(orderId, "pay_1") }, keys, fake)).toEqual({ ok: true, value: { credits: 2000 } });
    expect(await extra(A)).toBe(before + 2000);
    // The webhook for the same payment changes nothing more.
    const body = JSON.stringify({ event: "order.paid", payload: { order: { entity: { id: orderId } }, payment: { entity: { id: "pay_1", order_id: orderId, method: "upi" } } } });
    expect(await handleRazorpayWebhook(prisma, body, createHmac("sha256", "wh").update(body).digest("hex"), keys)).toBe(true);
    expect(await extra(A)).toBe(before + 2000);

    const paid = (await listPayments(prisma, A)).find((p) => p.id === purchaseId)!;
    expect(paid).toMatchObject({ status: "PAID", method: "upi", invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{5}$/) });
    const inv = await getInvoice(prisma, A, purchaseId);
    expect(inv?.snapshot).toMatchObject({ billedTo: { legalName: "Acme Pvt Ltd", gstin: "29ABCDE1234F1Z5", country: "IN" }, totalCents: 1000, currency: "USD" });
    expect(await getInvoice(prisma, B, purchaseId)).toBeNull();
  });

  it("the webhook completes a payment whose browser closed, and refuses bad signatures", async () => {
    const r = await startPackCheckout(prisma, A, "u1", "ai5k", keys, fake);
    if (!r.ok || r.value.kind !== "razorpay") throw new Error("expected a Razorpay checkout");
    const before = await extra(A);
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_2", order_id: r.value.orderId, method: "card" } } } });
    expect(await handleRazorpayWebhook(prisma, body, "bad", keys)).toBe(false);
    expect(await extra(A)).toBe(before);
    expect(await handleRazorpayWebhook(prisma, body, createHmac("sha256", "wh").update(body).digest("hex"), keys)).toBe(true);
    expect(await extra(A)).toBe(before + 5000);
    const numbers = (await listPayments(prisma, A)).map((p) => p.invoiceNumber).filter(Boolean);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
