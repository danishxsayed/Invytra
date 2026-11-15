/**
 * One WhatsApp contact's panel and editing it, against a real database (only with
 * TEST_DATABASE_URL — it is wiped): segments, activity, consent changes, clashes, tenancy.
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWaContactDetail, updateWaContact } from "../src/lib/whatsapp-contact-detail";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const A = "ws-wacd-a";
const B = "ws-wacd-b";
const now = new Date("2026-11-15T10:00:00Z");

d("whatsapp contact panel", () => {
  let prisma: PrismaClient;
  let id = "";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    const c = await prisma.whatsappContact.create({ data: { workspaceId: A, phone: "919820144120", firstName: "Priya", lastName: "Sharma", externalId: "USR-1", location: "Mumbai, Maharashtra", tags: ["vip"], vars: { last_order: "Kanjivaram Silk", location: "Mumbai, Maharashtra" }, consentSource: "IMPORT", consentAt: new Date("2025-03-12"), consentBy: "Olivia", createdAt: new Date("2025-03-12") } });
    id = c.id;
    await prisma.whatsappContact.create({ data: { workspaceId: A, phone: "919930021877", externalId: "USR-2" } });
    await prisma.whatsappSegment.createMany({
      data: [
        { workspaceId: A, name: "VIP customers", color: "green", rules: [{ field: "tag", op: "has", value: "vip" }] },
        { workspaceId: A, name: "Delhi", color: "blue", rules: [{ field: "location", op: "contains", value: "delhi" }] },
      ],
    });
    const camp = await prisma.whatsappCampaign.create({ data: { workspaceId: A, name: "Diwali Mega Sale", templateName: "t", language: "en", components: [], varMap: {}, status: "DONE" } });
    await prisma.whatsappMessage.create({ data: { workspaceId: A, campaignId: camp.id, contactId: id, phone: c.phone, status: "READ", sentAt: new Date("2026-10-01T04:30:00Z"), deliveredAt: new Date("2026-10-01T04:32:00Z"), readAt: new Date("2026-10-01T04:35:00Z"), repliedAt: new Date("2026-10-01T04:44:00Z") } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("shows details, consent, segments and activity; only in its workspace", async () => {
    expect(await getWaContactDetail(prisma, B, id, now)).toBeNull();
    const c = (await getWaContactDetail(prisma, A, id, now))!;
    expect(c).toMatchObject({ name: "Priya Sharma", phonePretty: "+91 98201 44120", userId: "USR-1", vars: { last_order: "Kanjivaram Silk" }, consent: { given: true, proof: "Confirmed by Olivia" } });
    expect(c.vars).not.toHaveProperty("location");
    expect(c.segments.map((s) => s.name)).toEqual(["VIP customers"]);
    expect(c.activity.map((a) => a.text)).toEqual(["Replied to Diwali Mega Sale", "Read Diwali Mega Sale", "Added by import"]);
  });

  it("edits every field, checks clashes, and switches consent", async () => {
    const base = { name: "Priya S. Sharma", phone: "+91 98201 44120", email: "p@x.in", userId: "USR-1", company: "", location: "New Delhi, Delhi", tags: ["VIP", "Sarees"], vars: { "Last Order": "Banarasi" }, consent: true };
    expect(await updateWaContact(prisma, B, id, "Olivia", base, now)).toMatchObject({ ok: false });
    expect(await updateWaContact(prisma, A, id, "Olivia", { ...base, userId: "USR-2" }, now)).toMatchObject({ ok: false, error: expect.stringContaining("User ID") });
    expect(await updateWaContact(prisma, A, id, "Olivia", { ...base, phone: "+91 99300 21877" }, now)).toMatchObject({ ok: false, error: expect.stringContaining("number") });
    expect(await updateWaContact(prisma, A, id, "Olivia", base, now)).toEqual({ ok: true, value: undefined });
    let c = (await getWaContactDetail(prisma, A, id, now))!;
    expect(c).toMatchObject({ firstName: "Priya", lastName: "S. Sharma", email: "p@x.in", location: "New Delhi, Delhi", tags: ["vip", "sarees"], vars: { last_order: "Banarasi" } });
    expect(c.segments.map((s) => s.name)).toEqual(["VIP customers", "Delhi"]);
    expect(await updateWaContact(prisma, A, id, "Olivia", { ...base, consent: false }, now)).toMatchObject({ ok: true });
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id } })).consentSource).toBeNull();
    expect(await updateWaContact(prisma, A, id, "Rahul", base, now)).toMatchObject({ ok: true });
    expect(await prisma.whatsappContact.findUniqueOrThrow({ where: { id } })).toMatchObject({ consentSource: "MANUAL", consentBy: "Rahul" });
    await prisma.whatsappContact.update({ where: { id }, data: { optedOutAt: now } });
    // Still editable, but stays opted out with its consent untouched.
    expect(await updateWaContact(prisma, A, id, "Rahul", { ...base, name: "Priya", consent: false }, now)).toMatchObject({ ok: true });
    expect(await prisma.whatsappContact.findUniqueOrThrow({ where: { id } })).toMatchObject({ firstName: "Priya", consentSource: "MANUAL" });
    c = (await getWaContactDetail(prisma, A, id, now))!;
    expect(c.activity[0]).toMatchObject({ kind: "opted_out" });
  });
});
