/**
 * Templates in review are checked with Meta by the worker (only with TEST_DATABASE_URL): an
 * approval shows up and is emailed once, even without the template webhook.
 */
import { PrismaClient, sealSecret, type MetaApp, type PlatformEmail } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkTemplatesInReview } from "../../src/whatsapp/templates";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const KEY = Buffer.alloc(32, 5).toString("base64");
const app: MetaApp = { appId: "1", appSecret: "s", configId: "c", verifyToken: "v", version: "v23.0" };
const WS = "ws-wa-tplcheck";

d("WhatsApp templates in review", () => {
  let prisma: PrismaClient;
  let metaStatus = "PENDING";
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: "m1", name: "diwali_sale", language: "en", status: metaStatus, category: "MARKETING", components: [] }, { id: "m2", name: "other", language: "en", status: "REJECTED", category: "MARKETING", components: [], rejected_reason: "INVALID_FORMAT" }] }))) as typeof fetch;
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { email: "owner@tplcheck.test" } });
    await prisma.workspace.create({ data: { id: WS, name: "Acme" } });
    const u = await prisma.user.create({ data: { email: "owner@tplcheck.test", name: "Sara", passwordHash: "x" } });
    await prisma.membership.create({ data: { userId: u.id, workspaceId: WS, role: "OWNER" } });
    await prisma.whatsappNumber.create({ data: { workspaceId: WS, wabaId: "waba-tc", phoneNumberId: "pn-tc", accessToken: sealSecret("tok", KEY) } });
    await prisma.whatsappTemplate.createMany({
      data: [
        { workspaceId: WS, wabaId: "waba-tc", metaId: "m1", name: "diwali_sale", language: "en", category: "MARKETING", status: "PENDING", components: [] },
        { workspaceId: WS, wabaId: "waba-tc", name: "other", language: "en", category: "MARKETING", status: "PENDING", components: [] },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.user.deleteMany({ where: { email: "owner@tplcheck.test" } });
    await prisma.$disconnect();
  });

  it("picks up Meta's decision and emails the owner once", async () => {
    const mails: PlatformEmail[] = [];
    const run = () => checkTemplatesInReview({ prisma, key: KEY, app, fetch: fakeFetch, notify: async (m) => void mails.push(...m) });
    expect(await run()).toEqual({ checked: 2, changed: 1 });
    expect(mails.map((m) => m.subject)).toEqual(['Rejected: your WhatsApp template "other"']);
    expect(await prisma.whatsappTemplate.findFirst({ where: { workspaceId: WS, name: "other" } })).toMatchObject({ status: "REJECTED", rejectedReason: "INVALID_FORMAT", metaId: "m2" });
    metaStatus = "APPROVED";
    expect(await run()).toEqual({ checked: 1, changed: 1 });
    expect(mails.at(-1)).toMatchObject({ to: "owner@tplcheck.test", subject: 'Approved: your WhatsApp template "diwali_sale"' });
    expect(await run()).toEqual({ checked: 0, changed: 0 });
    expect(mails).toHaveLength(2);
  });
});
