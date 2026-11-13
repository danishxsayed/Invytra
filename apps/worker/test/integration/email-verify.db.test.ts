/** Background email verification (only with TEST_DATABASE_URL). */
import { PrismaClient, type EmailVerifier } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyTick } from "../../src/email/verify.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("email verification job", () => {
  let prisma: PrismaClient;
  const WS = "ws-verify";
  const now = new Date("2026-11-02T06:00:00Z");
  const mx = async (dom: string) => (dom === "nomail.co" ? [] : ["mx.example.com"]);
  const answers: Record<string, string> = { "ok@fine.co": "ok", "gone@fine.co": "invalid", "any@catchall.co": "catch_all" };
  let calls = 0;
  const verifier: EmailVerifier = { name: "Test", check: async (e) => (calls++, { result: (answers[e] ?? "unknown") as never }) };
  const status = async (email: string) => prisma.emailContact.findFirstOrThrow({ where: { workspaceId: WS, email }, select: { verification: true, verifyDetail: true, verifiedAt: true } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.emailContact.updateMany({ where: { verification: "PENDING" }, data: { verification: "NOT_CHECKED" } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "V" } });
    await prisma.emailContact.createMany({
      data: ["ok@fine.co", "gone@fine.co", "any@catchall.co", "x@nomail.co", "y@mailinator.com", "later@fine.co"].map((email) => ({ workspaceId: WS, email, verification: "PENDING" as const })),
    });
    await prisma.emailContact.create({ data: { workspaceId: WS, email: "skip@fine.co", verification: "NOT_CHECKED" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("verifies pending contacts: free checks first, then the service", async () => {
    expect(await verifyTick({ prisma, verifier, mx, now })).toEqual({ checked: 6, waiting: 0, error: null });
    expect(calls).toBe(4); // the no-mail and throwaway domains never reached the service
    expect(await status("ok@fine.co")).toMatchObject({ verification: "VALID", verifiedAt: now });
    expect(await status("gone@fine.co")).toMatchObject({ verification: "INVALID" });
    expect(await status("any@catchall.co")).toMatchObject({ verification: "RISKY" });
    expect(await status("x@nomail.co")).toMatchObject({ verification: "INVALID", verifyDetail: expect.stringContaining("can't receive") });
    expect(await status("y@mailinator.com")).toMatchObject({ verification: "INVALID", verifyDetail: "Disposable (temporary) mailbox" });
    expect(await status("later@fine.co")).toMatchObject({ verification: "UNKNOWN" });
    expect(await status("skip@fine.co")).toMatchObject({ verification: "NOT_CHECKED" });
    // Only the 4 deep checks used credits (the trial's monthly allowance).
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: WS } })).toMatchObject({ verifyUsed: 4, verifyExtra: 0 });
  });

  it("waits (and says why) when the service account has a problem", async () => {
    await prisma.emailContact.updateMany({ where: { workspaceId: WS, email: "later@fine.co" }, data: { verification: "PENDING" } });
    const broke: EmailVerifier = { name: "Test", check: async () => ({ result: "error", error: "Insufficient credits" }) };
    expect(await verifyTick({ prisma, verifier: broke, mx, now })).toEqual({ checked: 0, waiting: 1, error: "Insufficient credits" });
    expect(await status("later@fine.co")).toMatchObject({ verification: "PENDING", verifyDetail: "Waiting: Insufficient credits" });
    // The service didn't check it, so the credit came back.
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: WS } })).verifyUsed).toBe(4);
  });

  it("uses this month's credits, then extra ones, then waits until more are added", async () => {
    // A paid plan with 999 of 1,000 used and 1 extra credit: two checks, then none left.
    await prisma.workspace.update({ where: { id: WS }, data: { plan: "growth", verifyMonthly: 1000, verifyUsed: 999, verifyPeriod: new Date("2026-11-01T00:00:00Z"), verifyExtra: 1 } });
    await prisma.emailContact.createMany({ data: ["a@fine.co", "b@fine.co", "c@fine.co"].map((email) => ({ workspaceId: WS, email, verification: "PENDING" as const })) });
    const r = await verifyTick({ prisma, verifier, mx, now, concurrency: 1 });
    expect(r.checked).toBe(2); // one monthly credit and one extra
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: WS } })).toMatchObject({ verifyUsed: 1000, verifyExtra: 0 });
    const left = await prisma.emailContact.findMany({ where: { workspaceId: WS, verification: "PENDING" } });
    expect(left).toHaveLength(2);
    expect(left.every((c) => /no verification credits left/.test(c.verifyDetail ?? ""))).toBe(true);
    // Next round: skipped without calling the service at all.
    const before = calls;
    expect(await verifyTick({ prisma, verifier, mx, now })).toMatchObject({ checked: 0 });
    expect(calls).toBe(before);
    // A new month brings 1,000 fresh credits.
    expect(await verifyTick({ prisma, verifier, mx, now: new Date("2026-12-01T08:00:00Z") })).toMatchObject({ checked: 2 });
    expect(await prisma.workspace.findUniqueOrThrow({ where: { id: WS } })).toMatchObject({ verifyUsed: 2 });
  });

  it("without a service, never calls an address valid", async () => {
    await prisma.emailContact.updateMany({ where: { workspaceId: WS, email: "later@fine.co" }, data: { verification: "PENDING" } });
    expect(await verifyTick({ prisma, verifier: null, mx, now })).toMatchObject({ checked: 1 });
    expect(await status("later@fine.co")).toMatchObject({ verification: "UNKNOWN" });
  });
});
