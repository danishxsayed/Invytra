/** Email verification credits: balance, orders, adding credits (only with TEST_DATABASE_URL). */
import { PrismaClient, spendVerifyCredit } from "@invytra/db";
import { monthlyVerifyCredits } from "@invytra/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addVerifyCredits, cancelVerifyOrder, getVerifyBalance, orderVerifyPack } from "../src/lib/verify-credits";
import { getAiBalance } from "../src/lib/ai-credits";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("verification credits", () => {
  let prisma: PrismaClient;
  const WS = "ws-credits";
  const OTHER = "ws-credits-other";
  const now = new Date("2026-11-10T06:00:00Z");

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "Paid", plan: "pro" }, { id: OTHER, name: "Other" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.$disconnect();
  });

  it("gives a paid workspace 1,000 a month", async () => {
    expect(await getVerifyBalance(prisma, WS, now)).toMatchObject({ monthly: 1000, monthlyLeft: 1000, extra: 0, left: 1000 });
    expect(await spendVerifyCredit(prisma, WS, monthlyVerifyCredits, now)).toBe("monthly");
    expect(await getVerifyBalance(prisma, WS, now)).toMatchObject({ monthlyUsed: 1, left: 999 });
  });

  it("saves an order as pending; paying it adds the credits once", async () => {
    const o = await orderVerifyPack(prisma, WS, "u1", "5k");
    expect(o).toMatchObject({ ok: true, value: { credits: 5000, priceCents: 750 } });
    expect((await getVerifyBalance(prisma, WS, now)).extra).toBe(0); // not paid yet
    expect(await addVerifyCredits(prisma, WS, 5000, "pay_123", now)).toBe(5000);
    expect(await prisma.verifyCreditPurchase.findUniqueOrThrow({ where: { id: o.ok ? o.value.id : "" } })).toMatchObject({ status: "PAID", paymentRef: "pay_123" });
    expect((await getVerifyBalance(prisma, WS, now)).extra).toBe(5000);
  });

  it("refuses unknown packs, and lets only the owner cancel an order", async () => {
    expect(await orderVerifyPack(prisma, WS, "u1", "1m")).toMatchObject({ ok: false });
    const o = await orderVerifyPack(prisma, WS, "u1", "10k");
    if (!o.ok) throw new Error(o.error);
    expect(await cancelVerifyOrder(prisma, OTHER, o.value.id)).toMatchObject({ ok: false });
    expect(await cancelVerifyOrder(prisma, WS, o.value.id)).toMatchObject({ ok: true });
    // A cancelled order is never paid: adding 10,000 records a new manual purchase instead.
    expect(await addVerifyCredits(prisma, WS, 10000, null, now)).toBe(10000);
    expect((await getVerifyBalance(prisma, WS, now)).extra).toBe(15000);
  });

  it("AI packs add AI credits, not verification credits", async () => {
    const o = await orderVerifyPack(prisma, WS, "u1", "ai2k");
    expect(o).toMatchObject({ ok: true, value: { credits: 2000, priceCents: 1000 } });
    const before = await prisma.workspace.findUniqueOrThrow({ where: { id: WS } });
    expect(await addVerifyCredits(prisma, WS, 2000, "pay_ai", now, "AI")).toBe(2000);
    const after = await prisma.workspace.findUniqueOrThrow({ where: { id: WS } });
    expect(after.aiExtra - before.aiExtra).toBe(2000);
    expect(after.verifyExtra).toBe(before.verifyExtra);
    const ai = await getAiBalance(prisma, WS, now);
    expect(ai).toMatchObject({ monthly: 500, extra: 2000, left: 2500 });
  });
});
