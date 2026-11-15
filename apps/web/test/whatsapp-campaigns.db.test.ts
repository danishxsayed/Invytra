/**
 * WhatsApp campaigns in the web app against a real database (only with TEST_DATABASE_URL — it is
 * wiped): creating (checks), delivery reports and replies from the webhook, pause/resume/cancel.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, type MetaApp } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleWhatsappWebhook } from "../src/lib/whatsapp-webhook";
import { audienceCount, changeWaCampaign, createWaCampaign, getWaCampaign, listRecipients } from "../src/lib/whatsapp-campaigns";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const app: MetaApp = { appId: "1", appSecret: "sec", configId: "c", verifyToken: "v", version: "v23.0" };
const WS = "ws-wacw";

d("whatsapp campaigns (web)", () => {
  let prisma: PrismaClient;
  let approved = "";
  let pending = "";
  const hook = (value: object) => {
    const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn-wacw" }, ...value } }] }] });
    return handleWhatsappWebhook(prisma, payload, `sha256=${createHmac("sha256", "sec").update(payload).digest("hex")}`, app);
  };
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Acme" } });
    await prisma.whatsappNumber.create({ data: { workspaceId: WS, wabaId: "w", phoneNumberId: "pn-wacw", accessToken: "x" } });
    const comps = [{ type: "BODY", text: "Hi {{1}}, quick idea. Interested?" }];
    approved = (await prisma.whatsappTemplate.create({ data: { workspaceId: WS, wabaId: "w", name: "intro", language: "en", category: "MARKETING", status: "APPROVED", components: comps } })).id;
    pending = (await prisma.whatsappTemplate.create({ data: { workspaceId: WS, wabaId: "w", name: "later", language: "en", category: "MARKETING", status: "PENDING", components: comps } })).id;
    await prisma.whatsappContact.createMany({ data: [{ workspaceId: WS, phone: "971500000001", firstName: "Omar", tags: ["dubai"] }, { workspaceId: WS, phone: "971500000002", tags: ["dubai"] }, { workspaceId: WS, phone: "971500000003", tags: ["dubai"] }] });
    await prisma.doNotContact.create({ data: { workspaceId: WS, kind: "PHONE", value: "971500000003", label: "x" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("counts the audience without opted-out or blocked numbers", async () => {
    expect(await audienceCount(prisma, WS, ["Dubai"])).toMatchObject({ count: 2 });
    expect(await audienceCount(prisma, WS, ["nobody"])).toMatchObject({ count: 0 });
  });

  it("creates only with an approved template, filled variables and people to send to", async () => {
    const base = { name: "Dubai", templateId: approved, tags: ["dubai"], varMap: { "body:1": { kind: "field", field: "first_name", fallback: "there" } } };
    expect(await createWaCampaign(prisma, WS, "Olivia", { ...base, templateId: pending })).toMatchObject({ ok: false, error: expect.stringContaining("approved") });
    expect(await createWaCampaign(prisma, WS, "Olivia", { ...base, varMap: {} })).toMatchObject({ ok: false, error: expect.stringContaining("{{1}}") });
    expect(await createWaCampaign(prisma, WS, "Olivia", { ...base, tags: ["nobody"] })).toMatchObject({ ok: false, error: expect.stringContaining("No subscribed") });
    const r = await createWaCampaign(prisma, WS, "Olivia", base);
    expect(r).toMatchObject({ ok: true });
    const c = await prisma.whatsappCampaign.findUniqueOrThrow({ where: { id: r.ok ? r.value.id : "" } });
    expect(c).toMatchObject({ status: "SCHEDULED", templateName: "intro", tags: ["dubai"], createdBy: "Olivia" });
  });

  it("delivery reports move forward only; a reply is credited to the campaign", async () => {
    const c = await prisma.whatsappCampaign.findFirstOrThrow({ where: { workspaceId: WS } });
    await prisma.whatsappCampaign.update({ where: { id: c.id }, data: { status: "SENDING", startedAt: new Date() } });
    const sentAt = new Date(Date.now() - 60_000);
    await prisma.whatsappMessage.createMany({
      data: [
        { workspaceId: WS, campaignId: c.id, phone: "971500000001", status: "SENT", wamid: "wamid.A", sentAt },
        { workspaceId: WS, campaignId: c.id, phone: "971500000002", status: "SENT", wamid: "wamid.B", sentAt },
      ],
    });
    const ts = String(Math.floor(Date.now() / 1000));
    await hook({ statuses: [{ id: "wamid.A", status: "read", timestamp: ts }, { id: "wamid.A", status: "delivered", timestamp: ts }, { id: "wamid.B", status: "failed", timestamp: ts, errors: [{ code: 131026, title: "Undeliverable" }] }] });
    await hook({ contacts: [{ wa_id: "971500000001", profile: { name: "Omar" } }], messages: [{ from: "971500000001", type: "text", text: { body: "Yes, tell me more" }, timestamp: ts }] });
    const [a, b] = await Promise.all([prisma.whatsappMessage.findUniqueOrThrow({ where: { wamid: "wamid.A" } }), prisma.whatsappMessage.findUniqueOrThrow({ where: { wamid: "wamid.B" } })]);
    expect(a.status).toBe("READ");
    expect(a.readAt && a.deliveredAt && a.repliedAt).toBeTruthy();
    expect(b).toMatchObject({ status: "FAILED", error: expect.stringContaining("Not on WhatsApp") });
    const s = (await getWaCampaign(prisma, WS, c.id))!.stats;
    expect(s).toMatchObject({ total: 2, sent: 2, delivered: 1, read: 1, replied: 1, failed: 1 });
    expect((await listRecipients(prisma, WS, c.id, "replied")).total).toBe(1);
  });

  it("pauses, resumes and cancels (only inside the workspace)", async () => {
    const c = await prisma.whatsappCampaign.findFirstOrThrow({ where: { workspaceId: WS } });
    expect(await changeWaCampaign(prisma, "other-ws", c.id, "pause")).toMatchObject({ ok: false });
    expect(await changeWaCampaign(prisma, WS, c.id, "pause")).toEqual({ ok: true, value: undefined });
    expect(await changeWaCampaign(prisma, WS, c.id, "resume")).toEqual({ ok: true, value: undefined });
    expect((await prisma.whatsappCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SENDING");
    await prisma.whatsappMessage.create({ data: { workspaceId: WS, campaignId: c.id, phone: "971500000009" } });
    expect(await changeWaCampaign(prisma, WS, c.id, "cancel")).toEqual({ ok: true, value: undefined });
    expect(await prisma.whatsappMessage.count({ where: { campaignId: c.id, status: "QUEUED" } })).toBe(0);
    expect(await prisma.whatsappMessage.count({ where: { campaignId: c.id } })).toBe(2);
  });
});
