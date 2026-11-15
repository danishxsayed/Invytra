/**
 * WhatsApp campaigns against a real database (only with TEST_DATABASE_URL — it is wiped) and a
 * fake Meta Cloud API: recipients, personalised sends, the daily limit, errors, finishing.
 */
import { PrismaClient, sealSecret, type MetaApp } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { whatsappCampaignTick } from "../../src/whatsapp/campaigns";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const KEY = Buffer.alloc(32, 3).toString("base64");
const app: MetaApp = { appId: "1", appSecret: "s", configId: "c", verifyToken: "v", version: "v23.0" };
const WS = "ws-wa-camp";

d("WhatsApp campaign engine", () => {
  let prisma: PrismaClient;
  const sent: { to: string; body: Record<string, unknown> }[] = [];
  let failFor: Record<string, number> = {};
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const to = String(body.to);
    if (failFor[to]) return new Response(JSON.stringify({ error: { code: failFor[to], message: "nope" } }), { status: 400 });
    sent.push({ to, body });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${to}.${sent.length}` }] }));
  }) as typeof fetch;
  const tick = (now: Date, batch = 50) => whatsappCampaignTick({ prisma, key: KEY, app, fetch: fakeFetch, now, batch });
  const comps = [{ type: "BODY", text: "Hi {{1}}, an idea for {{2}}. Interested?" }];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Acme" } });
    await prisma.whatsappNumber.create({ data: { workspaceId: WS, wabaId: "w", phoneNumberId: "pn-camp", accessToken: sealSecret("tok", KEY), messagingTier: "TIER_250" } });
    await prisma.whatsappContact.createMany({
      data: [
        { workspaceId: WS, phone: "971500000001", firstName: "Omar", company: "Gulf", tags: ["dubai"] },
        { workspaceId: WS, phone: "971500000002", firstName: null, tags: ["dubai"] },
        { workspaceId: WS, phone: "971500000003", firstName: "Out", tags: ["dubai"], optedOutAt: new Date() },
        { workspaceId: WS, phone: "971500000004", firstName: "Blocked", tags: ["dubai"] },
        { workspaceId: WS, phone: "919800000005", firstName: "Priya", tags: ["india"] },
      ],
    });
    await prisma.doNotContact.create({ data: { workspaceId: WS, kind: "PHONE", value: "971500000004", label: "+971500000004" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("starts when due, sends personalised messages to the right people, then finishes", async () => {
    const t0 = new Date("2026-11-15T10:00:00Z");
    const c = await prisma.whatsappCampaign.create({
      data: {
        workspaceId: WS, name: "Dubai", templateName: "intro", language: "en", components: comps, tags: ["dubai"], status: "SCHEDULED", scheduledAt: new Date(t0.getTime() + 60_000),
        varMap: { "body:1": { kind: "field", field: "first_name", fallback: "there" }, "body:2": { kind: "field", field: "company", fallback: "your team" } },
      },
    });
    expect(await tick(t0)).toMatchObject({ started: 0, sent: 0 });
    const r = await tick(new Date(t0.getTime() + 120_000));
    expect(r).toMatchObject({ started: 1, sent: 2 });
    expect(sent.map((s) => s.to).sort()).toEqual(["971500000001", "971500000002"]);
    expect(sent.find((s) => s.to === "971500000002")!.body).toMatchObject({
      type: "template",
      template: { name: "intro", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "there" }, { type: "text", text: "your team" }] }] },
    });
    const msgs = await prisma.whatsappMessage.findMany({ where: { campaignId: c.id }, orderBy: { phone: "asc" } });
    expect(msgs.map((m) => [m.phone, m.status])).toEqual([["971500000001", "SENT"], ["971500000002", "SENT"]]);
    expect(msgs[0]!.body).toBe("Hi Omar, an idea for Gulf. Interested?");
    expect(await tick(new Date(t0.getTime() + 180_000))).toMatchObject({ completed: 1 });
    expect((await prisma.whatsappCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("DONE");
  });

  it("stays inside the number's daily limit and marks failures", async () => {
    await prisma.whatsappNumber.updateMany({ where: { workspaceId: WS }, data: { messagingTier: "TIER_50" } });
    // 2 people already messaged in the last 24h; limit 50 → 48 left, batch caps first.
    await prisma.whatsappContact.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ workspaceId: WS, phone: `9715100${String(i).padStart(5, "0")}`, tags: ["bulk"] })) });
    failFor = { "971510000003": 131026 };
    const t = new Date("2026-11-15T12:00:00Z");
    const c = await prisma.whatsappCampaign.create({ data: { workspaceId: WS, name: "Bulk", templateName: "hello", language: "en", components: [{ type: "BODY", text: "Hello" }], tags: ["bulk"], status: "SCHEDULED", scheduledAt: t, varMap: {} } });
    const r = await tick(t, 100);
    expect(r.sent + r.failed).toBe(48);
    expect(r.failed).toBe(1);
    const failed = await prisma.whatsappMessage.findFirstOrThrow({ where: { campaignId: c.id, status: "FAILED" } });
    expect(failed.error).toContain("Not on WhatsApp");
    // The failed one never reached anyone, so one more fits; then the limit is full.
    expect(await tick(new Date(t.getTime() + 60_000), 100)).toMatchObject({ sent: 1 });
    expect(await tick(new Date(t.getTime() + 120_000), 100)).toMatchObject({ sent: 0 });
    expect(await prisma.whatsappMessage.count({ where: { campaignId: c.id, status: "QUEUED" } })).toBe(11);
  });

  it("pauses when Meta cuts the connection, without losing the queue", async () => {
    await prisma.whatsappNumber.updateMany({ where: { workspaceId: WS }, data: { messagingTier: "TIER_10K" } });
    failFor = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`9715100${String(i).padStart(5, "0")}`, 190]));
    const r = await tick(new Date("2026-11-15T12:05:00Z"));
    expect(r.paused).toBe(1);
    const c = await prisma.whatsappCampaign.findFirstOrThrow({ where: { workspaceId: WS, name: "Bulk" } });
    expect(c).toMatchObject({ status: "PAUSED" });
    expect(c.note).toContain("Connect the number again");
    expect((await prisma.whatsappNumber.findFirstOrThrow({ where: { workspaceId: WS } })).status).toBe("ERROR");
    expect(await prisma.whatsappMessage.count({ where: { campaignId: c.id, status: "QUEUED" } })).toBe(11);
  });
});
