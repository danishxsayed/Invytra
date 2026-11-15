/**
 * WhatsApp segments, tag management and the list's views against a real database (only with
 * TEST_DATABASE_URL — it is wiped): rules, previews, saving, campaigns to a segment, renaming
 * and deleting tags (segment rules follow), WhatsApp status from delivery reports.
 */
import { createHmac } from "node:crypto";
import { PrismaClient, type MetaApp } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audienceCount } from "../src/lib/whatsapp-campaigns";
import { deleteWaTags, listWaContacts, renameWaTag, waContactSummary } from "../src/lib/whatsapp-contacts";
import { deleteSegments, listSegments, previewSegment, saveSegment } from "../src/lib/whatsapp-segments";
import { handleWhatsappWebhook } from "../src/lib/whatsapp-webhook";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = "ws-waseg-a";
const B = "ws-waseg-b";
const now = new Date("2026-11-15T10:00:00Z");
const app: MetaApp = { appId: "1", appSecret: "sec", configId: "c", verifyToken: "v", version: "v23.0" };

d("whatsapp segments and tags", () => {
  let prisma: PrismaClient;
  let segId = "";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    const c = (phone: string, o: object) => ({ workspaceId: A, phone, consentSource: "IMPORT", ...o });
    await prisma.whatsappContact.createMany({
      data: [
        c("919820144120", { firstName: "Priya", tags: ["vip", "sarees"], location: "Mumbai, Maharashtra", lastInboundAt: new Date("2026-11-10T00:00:00Z"), waStatus: "ON" }),
        c("919930021877", { firstName: "Rahul", tags: ["vip"], location: "New Delhi, Delhi" }),
        c("919447011209", { firstName: "Meera", tags: ["patients"], location: "Kochi, Kerala", waStatus: "NOT_FOUND" }),
        c("919811055302", { firstName: "Ananya", tags: ["vip"], location: "Mumbai", consentSource: null }),
        { workspaceId: B, phone: "919820144120", tags: ["vip"], location: "Mumbai" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("views, tag and city filters", async () => {
    const s = await waContactSummary(prisma, A, now);
    expect(s.counts).toEqual({ all: 4, active: 1, not_on_whatsapp: 1, not_opted_in: 1, opted_out: 0 });
    expect(s.cities).toEqual([
      { city: "Mumbai", count: 2 },
      { city: "Kochi", count: 1 },
      { city: "New Delhi", count: 1 },
    ]);
    expect((await listWaContacts(prisma, A, { city: "mumbai", tag: "vip" })).total).toBe(2);
    expect((await listWaContacts(prisma, A, { q: "USR" })).total).toBe(0);
  });

  it("previews and saves a segment; it only sees its own workspace", async () => {
    const rules = { match: "all", rules: [{ field: "tag", op: "has", value: "VIP" }, { field: "location", op: "contains", value: "mumbai" }] };
    expect(await previewSegment(prisma, A, rules, now)).toEqual({ count: 2, names: ["Ananya", "Priya"] });
    expect(await previewSegment(prisma, A, { match: "all", rules: [] }, now)).toMatchObject({ error: expect.stringContaining("rule") });
    expect(await previewSegment(prisma, A, { match: "any", rules: [{ field: "whatsapp", op: "is", value: "not_found" }, { field: "active", op: "within", value: "30" }] }, now)).toMatchObject({ count: 2 });
    expect(await saveSegment(prisma, A, null, { name: "", ...rules })).toMatchObject({ ok: false, error: expect.stringContaining("Name") });
    const r = await saveSegment(prisma, A, null, { name: "VIP in Mumbai", color: "blue", ...rules });
    expect(r).toMatchObject({ ok: true });
    segId = r.ok ? r.value.id : "";
    expect(await saveSegment(prisma, A, null, { name: "vip in mumbai", ...rules })).toMatchObject({ ok: false, error: expect.stringContaining("already") });
    expect(await saveSegment(prisma, B, segId, { name: "Stolen", ...rules })).toMatchObject({ ok: false });
    expect(await listSegments(prisma, A, now)).toEqual([expect.objectContaining({ name: "VIP in Mumbai", color: "blue", count: 2 })]);
    expect(await listSegments(prisma, B, now)).toEqual([]);
  });

  it("a campaign to a segment reaches only its opted-in members", async () => {
    expect(await audienceCount(prisma, A, [], segId, now)).toMatchObject({ count: 1, sample: expect.objectContaining({ firstName: "Priya" }) });
    expect(await audienceCount(prisma, B, [], segId, now)).toMatchObject({ count: 0 });
  });

  it("renames and deletes tags everywhere, segment rules follow; contacts stay", async () => {
    expect(await renameWaTag(prisma, A, "vip", "VIP Clients")).toEqual({ ok: true, value: 3 });
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919820144120" } })).tags.sort()).toEqual(["sarees", "vip-clients"]);
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: B } })).tags).toEqual(["vip"]);
    expect((await listSegments(prisma, A, now))[0]!.rules[0]).toEqual({ field: "tag", op: "has", value: "vip-clients" });
    // Renaming into an existing tag merges, no duplicates.
    expect(await renameWaTag(prisma, A, "sarees", "vip-clients")).toEqual({ ok: true, value: 1 });
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919820144120" } })).tags).toEqual(["vip-clients"]);
    expect(await deleteWaTags(prisma, A, ["vip-clients"])).toEqual({ ok: true, value: 3 });
    expect(await prisma.whatsappContact.count({ where: { workspaceId: A } })).toBe(4);
    expect((await listSegments(prisma, A, now))[0]!.rules).toEqual([{ field: "location", op: "contains", value: "mumbai" }]);
    expect(await deleteSegments(prisma, B, [segId])).toEqual({ ok: true, value: 0 });
    expect(await deleteSegments(prisma, A, [segId])).toEqual({ ok: true, value: 1 });
    expect(await prisma.whatsappContact.count({ where: { workspaceId: A } })).toBe(4);
  });

  it("learns who is on WhatsApp from delivery reports", async () => {
    await prisma.whatsappNumber.create({ data: { workspaceId: A, wabaId: "w", phoneNumberId: "pn-waseg", accessToken: "x" } });
    const rahul = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919930021877" } });
    const ananya = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919811055302" } });
    await prisma.whatsappMessage.createMany({
      data: [
        { workspaceId: A, contactId: rahul.id, phone: rahul.phone, wamid: "wamid.r", status: "SENT" },
        { workspaceId: A, contactId: ananya.id, phone: ananya.phone, wamid: "wamid.a", status: "SENT" },
      ],
    });
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "w", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn-waseg" }, statuses: [{ id: "wamid.r", status: "delivered", timestamp: "1794650000" }, { id: "wamid.a", status: "failed", timestamp: "1794650000", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }],
    });
    expect(await handleWhatsappWebhook(prisma, payload, `sha256=${createHmac("sha256", "sec").update(payload).digest("hex")}`, app)).toEqual({ status: 200 });
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id: rahul.id } })).waStatus).toBe("ON");
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id: ananya.id } })).waStatus).toBe("NOT_FOUND");
  });
});
