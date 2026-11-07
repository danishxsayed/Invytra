/** AI credit spending (only with TEST_DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { aiCreditsLeft, refundAiCredits, spendAiCredits } from "../src/ai-credits.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const monthly = (plan: string) => (plan === "trial" ? 50 : 500);

d("AI credits", () => {
  let prisma: PrismaClient;
  const WS = "ws-ai-credits";
  const now = new Date("2026-11-10T06:00:00Z");
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "AI", plan: "pro", aiUsed: 497, aiPeriod: new Date("2026-11-01T00:00:00Z"), aiExtra: 4 } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("takes this month's credits first, then extra, and logs the use", async () => {
    expect(await aiCreditsLeft(prisma, WS, monthly, now)).toBe(7);
    const s = await spendAiCredits(prisma, WS, 5, "VOICE", monthly, { ref: "lead-1", now });
    expect(s).toMatchObject({ fromMonthly: 3, fromExtra: 2 });
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: WS } })).toMatchObject({ aiUsed: 500, aiExtra: 2 });
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "VOICE", credits: 5 } })).toBe(1);
  });

  it("never takes part of a cost: not enough means nothing is spent", async () => {
    expect(await spendAiCredits(prisma, WS, 5, "VIDEO", monthly, { now })).toBeNull();
    expect(await aiCreditsLeft(prisma, WS, monthly, now)).toBe(2);
  });

  it("two spends at once can't both take the last credits", async () => {
    const r = await Promise.all([spendAiCredits(prisma, WS, 2, "HANDWRITTEN", monthly, { now }), spendAiCredits(prisma, WS, 2, "HANDWRITTEN", monthly, { now })]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await aiCreditsLeft(prisma, WS, monthly, now)).toBe(0);
  });

  it("refunds give the credits back and remove the use", async () => {
    const next = new Date("2026-12-03T06:00:00Z");
    const s = await spendAiCredits(prisma, WS, 1, "TEXT", monthly, { now: next });
    expect(s).toMatchObject({ fromMonthly: 1, fromExtra: 0 });
    expect(await aiCreditsLeft(prisma, WS, monthly, next)).toBe(499);
    await refundAiCredits(prisma, WS, s!);
    expect(await aiCreditsLeft(prisma, WS, monthly, next)).toBe(500);
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "TEXT" } })).toBe(0);
  });
});
