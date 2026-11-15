/**
 * WhatsApp contacts against a real database (only with TEST_DATABASE_URL — it is wiped):
 * consent, imports, tags, opt-outs (by hand, by "STOP", from the do-not-contact list).
 */
import { createHmac } from "node:crypto";
import { PrismaClient, type MetaApp } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDnc } from "../src/lib/do-not-contact";
import { handleWhatsappWebhook } from "../src/lib/whatsapp-webhook";
import { addWaContact, deleteWaContacts, importWaContacts, listWaContacts, optOutWaContacts, tagWaContacts, waContactSummary } from "../src/lib/whatsapp-contacts";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const app: MetaApp = { appId: "1", appSecret: "sec", configId: "c", verifyToken: "v", version: "v23.0" };

d("whatsapp contacts", () => {
  let prisma: PrismaClient;
  const A = "ws-wac-a";
  const B = "ws-wac-b";
  const now = new Date("2026-11-14T10:00:00Z");
  const clean = () => prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await clean();
    await prisma.workspace.createMany({ data: [{ id: A, name: "Acme" }, { id: B, name: "Other" }] });
    await prisma.whatsappNumber.create({ data: { workspaceId: A, wabaId: "w1", phoneNumberId: "pn-wac-1", accessToken: "x" } });
  });
  afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("adds by hand: a name, a full number, consent yes or no", async () => {
    expect(await addWaContact(prisma, A, "Olivia", { name: "Omar", phone: "+971 50 123 4567" }, now)).toMatchObject({ ok: false });
    expect(await addWaContact(prisma, A, "Olivia", { name: "Omar", phone: "12", consent: true }, now)).toMatchObject({ ok: false, error: expect.stringContaining("country code") });
    expect(await addWaContact(prisma, A, "Olivia", { name: "Omar", phone: "+971 50 123 4567", tags: ["Dubai", "warm"], userId: "USR-1", appointment: "2026-12-01T10:30", location: "Dubai", consent: true }, now)).toMatchObject({ ok: true });
    expect(await addWaContact(prisma, A, "Olivia", { name: "Omar", phone: "00971501234567", consent: true }, now)).toMatchObject({ ok: false, error: expect.stringContaining("already") });
    expect(await addWaContact(prisma, A, "Olivia", { name: "Other", phone: "+971501234599", userId: "USR-1", consent: true }, now)).toMatchObject({ ok: false, error: expect.stringContaining("User ID") });
    const c = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A } });
    expect(c).toMatchObject({ phone: "971501234567", firstName: "Omar", externalId: "USR-1", tags: ["dubai", "warm"], vars: { appointment_time: "2026-12-01 10:30", location: "Dubai" }, consentSource: "MANUAL", consentBy: "Olivia" });
    // "No": saved, but not opted in (campaigns skip them).
    expect(await addWaContact(prisma, A, "Olivia", { name: "Nadia", phone: "+971501234500", consent: false }, now)).toMatchObject({ ok: true });
    expect(await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "971501234500" } })).toMatchObject({ consentSource: null });
    expect((await waContactSummary(prisma, A)).counts).toEqual({ all: 2, subscribed: 1, no_consent: 1, opted_out: 0 });
    await prisma.whatsappContact.deleteMany({ where: { workspaceId: A, phone: "971501234500" } });
  });

  it("imports a CSV: new and updated contacts, default country code, extra tags", async () => {
    const text = "Phone,Name,City\n050 123 4567,Omar Haddad,Dubai\n+919876543210,Priya Shah,Mumbai\nnope,Bad,\n";
    const mapping = ["phone", "full_name", "custom:city"];
    expect(await importWaContacts(prisma, A, "Olivia", { text, mapping, defaultCountry: "971" }, now)).toMatchObject({ ok: false, error: expect.stringContaining("agreed") });
    const r = await importWaContacts(prisma, A, "Olivia", { text, mapping, defaultCountry: "971", tags: "Expo 2026", consent: true }, now);
    expect(r).toEqual({ ok: true, value: { added: 1, updated: 1, invalid: 1, duplicates: 0, blocked: 0, overLimit: 0, noConsent: 0 } });
    const omar = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "971501234567" } });
    expect(omar).toMatchObject({ firstName: "Omar", lastName: "Haddad", tags: ["dubai", "warm", "expo-2026"], vars: { city: "Dubai", appointment_time: "2026-12-01 10:30" } });
    const s = await waContactSummary(prisma, A);
    expect(s.counts).toEqual({ all: 2, subscribed: 2, no_consent: 0, opted_out: 0 });
    expect(s.tags).toContainEqual({ tag: "expo-2026", count: 2 });
    expect((await listWaContacts(prisma, A, { tag: "warm" })).total).toBe(1);
    expect((await listWaContacts(prisma, A, { q: "9876" })).rows[0]).toMatchObject({ firstName: "Priya" });
    expect((await listWaContacts(prisma, B)).total).toBe(0);
  });

  it("re-imports match by User ID first; a consent column decides who is opted in", async () => {
    const text = "User ID,Phone,Name,WhatsApp Opted\nUSR-1,+971 50 999 0000,Omar H,yes\nUSR-9,+447700900555,Lena,no\n";
    const mapping = ["user_id", "phone", "full_name", "consent"];
    // Only "no" rows: nothing to confirm.
    expect(await importWaContacts(prisma, A, "Olivia", { text: "Phone,WhatsApp Opted\n+447700900556,no\n", mapping: ["phone", "consent"] }, now)).toMatchObject({ ok: true, value: { added: 1, noConsent: 1 } });
    expect(await importWaContacts(prisma, A, "Olivia", { text, mapping }, now)).toMatchObject({ ok: false, error: expect.stringContaining("opted in") });
    expect(await importWaContacts(prisma, A, "Olivia", { text, mapping, consent: true }, now)).toMatchObject({ ok: true, value: { added: 1, updated: 1, noConsent: 1 } });
    // USR-1 was +971501234567: the same contact now has the new number.
    expect(await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, externalId: "USR-1" } })).toMatchObject({ phone: "971509990000", firstName: "Omar", lastName: "H" });
    expect(await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, externalId: "USR-9" } })).toMatchObject({ consentSource: null });
    await prisma.whatsappContact.deleteMany({ where: { workspaceId: A, phone: { in: ["447700900555", "447700900556"] } } });
    await prisma.whatsappContact.updateMany({ where: { workspaceId: A, externalId: "USR-1" }, data: { phone: "971501234567" } });
  });

  it("tags in bulk, only inside the workspace", async () => {
    const ids = (await prisma.whatsappContact.findMany({ where: { workspaceId: A } })).map((c) => c.id);
    expect(await tagWaContacts(prisma, A, ids, "VIP", true)).toEqual({ ok: true, value: 2 });
    expect(await tagWaContacts(prisma, B, ids, "x", true)).toEqual({ ok: true, value: 0 });
    expect(await tagWaContacts(prisma, A, ids, "vip", false)).toEqual({ ok: true, value: 2 });
  });

  it("a STOP reply opts them out everywhere; they can't be imported back", async () => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "w1", changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn-wac-1" }, contacts: [{ wa_id: "919876543210", profile: { name: "Priya S" } }, { wa_id: "447700900123", profile: { name: "New Lead" } }], messages: [{ from: "919876543210", type: "text", text: { body: "Stop" }, timestamp: "1794650000" }, { from: "447700900123", type: "text", text: { body: "Hi, saw your ad" }, timestamp: "1794650001" }] } }] }],
    });
    const sig = `sha256=${createHmac("sha256", "sec").update(payload).digest("hex")}`;
    expect(await handleWhatsappWebhook(prisma, payload, sig, app)).toEqual({ status: 200 });
    const priya = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919876543210" } });
    expect(priya).toMatchObject({ profileName: "Priya S", optOutReason: "Replied “Stop”" });
    expect(priya.optedOutAt).not.toBeNull();
    expect(await prisma.doNotContact.count({ where: { workspaceId: A, kind: "PHONE", value: "919876543210" } })).toBe(1);
    const lead = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "447700900123" } });
    expect(lead).toMatchObject({ consentSource: "INBOUND", profileName: "New Lead", optedOutAt: null });
    expect(lead.lastInboundAt).not.toBeNull();
    await prisma.whatsappContact.delete({ where: { id: priya.id } });
    const r = await importWaContacts(prisma, A, "Olivia", { text: "+919876543210\n+919876543211\n+919876543212\n", mapping: ["phone"], consent: true }, now);
    expect(r).toMatchObject({ ok: true, value: { added: 2, blocked: 1 } });
    expect(await addWaContact(prisma, A, "Olivia", { name: "Priya", phone: "+919876543210", consent: true })).toMatchObject({ ok: false, error: expect.stringContaining("do-not-contact") });
  });

  it("opting out by hand and from the do-not-contact page", async () => {
    const omar = await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "971501234567" } });
    expect(await optOutWaContacts(prisma, A, [omar.id], { id: "u1", name: "Olivia" })).toEqual({ ok: true, value: 1 });
    expect(await prisma.whatsappContact.findUniqueOrThrow({ where: { id: omar.id } })).toMatchObject({ optOutReason: "Opted out by Olivia" });
    await addDnc(prisma, A, "u1", "+91 98765 43211");
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { workspaceId: A, phone: "919876543211" } })).optedOutAt).not.toBeNull();
    const ids = (await prisma.whatsappContact.findMany({ where: { workspaceId: A } })).map((c) => c.id);
    expect(await deleteWaContacts(prisma, B, ids)).toEqual({ ok: true, value: 0 });
    expect(await deleteWaContacts(prisma, A, ids)).toEqual({ ok: true, value: ids.length });
  });
});
