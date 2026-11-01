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
  });

  it("waits (and says why) when the service account has a problem", async () => {
    await prisma.emailContact.updateMany({ where: { workspaceId: WS, email: "later@fine.co" }, data: { verification: "PENDING" } });
    const broke: EmailVerifier = { name: "Test", check: async () => ({ result: "error", error: "Insufficient credits" }) };
    expect(await verifyTick({ prisma, verifier: broke, mx, now })).toEqual({ checked: 0, waiting: 1, error: "Insufficient credits" });
    expect(await status("later@fine.co")).toMatchObject({ verification: "PENDING", verifyDetail: "Waiting: Insufficient credits" });
  });

  it("without a service, never calls an address valid", async () => {
    expect(await verifyTick({ prisma, verifier: null, mx, now })).toMatchObject({ checked: 1 });
    expect(await status("later@fine.co")).toMatchObject({ verification: "UNKNOWN" });
  });
});
