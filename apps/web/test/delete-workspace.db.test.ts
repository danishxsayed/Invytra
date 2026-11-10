/**
 * Deleting a workspace against a real database (only with TEST_DATABASE_URL — it is wiped).
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteWorkspace } from "../src/lib/delete-workspace";
import { hashPassword } from "../src/lib/password";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("delete workspace", () => {
  let prisma: PrismaClient;
  const A = "ws-del-a";
  const B = "ws-del-b";
  const dir = mkdtempSync(path.join(tmpdir(), "del-ws-"));
  const removedAccounts: string[] = [];
  const removedVoices: string[] = [];
  const tools = {
    unipile: { deleteAccount: async (id: string) => void removedAccounts.push(id) },
    voice: { remove: async (id: string) => void removedVoices.push(id) },
    dataDir: dir,
  };
  const owner = { userId: "u-del-owner", workspaceId: A, role: "OWNER" };

  beforeAll(async () => {
    process.env.VIDEO_DIR = path.join(dir, "videos");
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.archivedInvoice.deleteMany({ where: { workspaceId: A } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: ["u-del-owner", "u-del-both", "u-del-member"] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Northwind Studio" }, { id: B, name: "Other" }] });
    const hash = await hashPassword("right-password-123");
    await prisma.user.create({ data: { id: "u-del-owner", email: "del-owner@x.co", name: "Owner", passwordHash: hash, memberships: { create: { workspaceId: A, role: "OWNER" } } } });
    await prisma.user.create({ data: { id: "u-del-member", email: "del-member@x.co", name: "Member", passwordHash: hash, memberships: { create: { workspaceId: A, role: "MEMBER" } } } });
    await prisma.user.create({ data: { id: "u-del-both", email: "del-both@x.co", name: "Both", passwordHash: hash, memberships: { create: [{ workspaceId: A, role: "MEMBER" }, { workspaceId: B, role: "OWNER" }] } } });
    await prisma.linkedinAccount.create({ data: { id: "acc-del-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE", unipileAccountId: "uni-del-1" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-del-b", workspaceId: B, label: "b", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "list-del-a", workspaceId: A, name: "L" } });
    await prisma.campaign.create({ data: { id: "camp-del-a", workspaceId: A, name: "C", listId: "list-del-a", steps: [], settings: {}, status: "ACTIVE" } });
    await prisma.voiceClone.create({ data: { workspaceId: A, name: "Me", providerVoiceId: "el-del-1", consentAt: new Date(), consentByUserId: "u-del-owner" } });
    await prisma.verifyCreditPurchase.create({
      data: { workspaceId: A, kind: "AI", credits: 2000, priceCents: 1000, currency: "USD", status: "PAID", paidAt: new Date(), invoiceNumber: "INV-2026-DEL1", invoice: { buyer: { name: "Northwind Studio" } } },
    });
    await prisma.verifyCreditPurchase.create({ data: { workspaceId: A, kind: "AI", credits: 2000, priceCents: 1000, status: "PENDING" } });
    // Files: a recording and a failure screenshot of each workspace's account.
    mkdirSync(path.join(dir, "videos", A), { recursive: true });
    writeFileSync(path.join(dir, "videos", A, "rec.mp4"), "x");
    mkdirSync(path.join(dir, "screenshots"), { recursive: true });
    writeFileSync(path.join(dir, "screenshots", "acc-del-a-CHECKPOINT-1.png"), "x");
    writeFileSync(path.join(dir, "screenshots", "acc-del-b-CHECKPOINT-1.png"), "x");
  });
  afterAll(async () => {
    await prisma.archivedInvoice.deleteMany({ where: { workspaceId: A } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.user.deleteMany({ where: { id: { in: ["u-del-owner", "u-del-both", "u-del-member"] } } });
    await prisma.$disconnect();
  });

  it("only the owner, with the workspace name and their password", async () => {
    const ok = { name: "northwind studio", password: "right-password-123" };
    expect(await deleteWorkspace(prisma, { ...owner, userId: "u-del-member", role: "MEMBER" }, ok, tools)).toEqual({ ok: false, error: "Only the workspace owner can delete the workspace." });
    expect(await deleteWorkspace(prisma, owner, { ...ok, name: "Northwind" }, tools)).toMatchObject({ ok: false, error: expect.stringContaining("Type the workspace name") });
    expect(await deleteWorkspace(prisma, owner, { ...ok, password: "wrong" }, tools)).toEqual({ ok: false, error: "That password isn't right." });
    expect(await prisma.workspace.count({ where: { id: A } })).toBe(1);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: "camp-del-a" } })).status).toBe("ACTIVE");
  });

  it("waits for a LinkedIn action that's running, with everything already paused", async () => {
    const run = await prisma.action.create({ data: { accountId: "acc-del-a", type: "PROFILE_VISIT", status: "RUNNING", scheduledAt: new Date() } });
    const r = await deleteWorkspace(prisma, owner, { name: "Northwind Studio", password: "right-password-123" }, tools);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("try again in a minute") });
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: "camp-del-a" } })).status).toBe("PAUSED");
    expect((await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: "acc-del-a" } })).status).toBe("PAUSED");
    await prisma.action.update({ where: { id: run.id }, data: { status: "SUCCEEDED" } });
  });

  it("deletes everything, keeps paid invoices, and touches nothing of another workspace", async () => {
    expect(await deleteWorkspace(prisma, owner, { name: "Northwind Studio", password: "right-password-123" }, tools)).toEqual({ ok: true, value: undefined });
    expect(await prisma.workspace.count({ where: { id: A } })).toBe(0);
    expect(await prisma.linkedinAccount.count({ where: { workspaceId: A } })).toBe(0);
    expect(await prisma.verifyCreditPurchase.count({ where: { workspaceId: A } })).toBe(0);
    expect(removedAccounts).toEqual(["uni-del-1"]);
    expect(removedVoices).toEqual(["el-del-1"]);
    // Only the paid invoice is kept, as issued.
    const kept = await prisma.archivedInvoice.findMany({ where: { workspaceId: A } });
    expect(kept).toEqual([expect.objectContaining({ invoiceNumber: "INV-2026-DEL1", workspaceName: "Northwind Studio", priceCents: 1000, invoice: { buyer: { name: "Northwind Studio" } } })]);
    // Logins: gone for people only in this workspace; kept for someone also in another one.
    expect(await prisma.user.count({ where: { id: { in: ["u-del-owner", "u-del-member"] } } })).toBe(0);
    expect(await prisma.membership.findMany({ where: { userId: "u-del-both" }, select: { workspaceId: true } })).toEqual([{ workspaceId: B }]);
    // Files of this workspace only.
    expect(existsSync(path.join(dir, "videos", A))).toBe(false);
    expect(existsSync(path.join(dir, "screenshots", "acc-del-a-CHECKPOINT-1.png"))).toBe(false);
    expect(existsSync(path.join(dir, "screenshots", "acc-del-b-CHECKPOINT-1.png"))).toBe(true);
    expect(await prisma.linkedinAccount.count({ where: { id: "acc-del-b" } })).toBe(1);
  });
});
