/**
 * Contacts against a real database (only with TEST_DATABASE_URL — it is wiped): one person
 * across channels, filters, the timeline, editing.
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPerson, listPeople, updatePerson } from "../src/lib/contacts";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const U = (s: string) => `https://www.linkedin.com/in/${s}/`;
const H = 3_600_000;

d("contacts", () => {
  let prisma: PrismaClient;
  const WS = "ws-ct";
  const t = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, "ws-ct-other"] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "C" }, { id: "ws-ct-other", name: "O" }] });
    await prisma.linkedinAccount.create({ data: { id: "ct-acc", workspaceId: WS, label: "Main", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.leadList.create({ data: { id: "ct-list", workspaceId: WS, name: "Founders" } });
    await prisma.lead.createMany({
      data: [
        { id: "ct-l-ana", workspaceId: WS, listId: "ct-list", profileUrl: U("ana"), firstName: "Ana", lastName: "Silva", company: "Acme", email: "ana@acme.io" },
        { id: "ct-l-bo", workspaceId: WS, listId: "ct-list", profileUrl: U("bo"), firstName: "Bo" },
      ],
    });
    await prisma.emailContact.create({ data: { id: "ct-c-ana", workspaceId: WS, email: "ana@acme.io" } });
    await prisma.emailContact.create({ data: { id: "ct-c-eve", workspaceId: WS, email: "eve@x.co", firstName: "Eve" } });
    await prisma.campaign.create({ data: { id: "ct-camp", workspaceId: WS, name: "LI founders", listId: "ct-list", status: "ACTIVE", steps: [], settings: {} } });
    await prisma.campaignLead.create({ data: { id: "ct-cl-ana", campaignId: "ct-camp", workspaceId: WS, leadId: "ct-l-ana", profileUrl: U("ana"), state: "REPLIED", connectedAt: new Date(t - 30 * H) } });
    await prisma.action.createMany({
      data: [
        { accountId: "ct-acc", type: "CONNECTION_REQUEST", status: "SUCCEEDED", targetUrl: U("ana"), scheduledAt: new Date(t - 50 * H), executedAt: new Date(t - 50 * H), payload: { note: "Hi Ana!" } },
        { accountId: "ct-acc", type: "MESSAGE", status: "SUCCEEDED", targetUrl: U("ana"), scheduledAt: new Date(t - 20 * H), executedAt: new Date(t - 20 * H), payload: { text: "Thanks for connecting" } },
      ],
    });
    await prisma.conversation.create({ data: { accountId: "ct-acc", participantName: "Ana Silva", campaignLeadId: "ct-cl-ana", meetingAt: new Date(t - 2 * H), messages: { create: { fromMe: false, text: "Let's talk!", sentAt: new Date(t - 10 * H), key: "1" } } } });
    await prisma.emailAccount.create({ data: { id: "ct-mb", workspaceId: WS, email: "me@c.co", fromName: "Me", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: "me@c.co", secret: "x" } });
    await prisma.emailCampaign.create({ data: { id: "ct-ec", workspaceId: WS, name: "Email Q4", status: "ACTIVE", leads: { create: { id: "ct-el-ana", workspaceId: WS, email: "ana@acme.io", contactId: "ct-c-ana", status: "SKIPPED" } } } });
    await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: "ct-mb", emailLeadId: "ct-el-ana", kind: "CAMPAIGN", status: "SENT", toEmail: "ana@acme.io", subject: "Quick question", text: "Hi Ana", stepIndex: 0, createdAt: new Date(t - 40 * H) } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, "ws-ct-other"] } } });
    await prisma.$disconnect();
  });

  it("lists one row per person across channels, with filters and search", async () => {
    const all = await listPeople(prisma, WS);
    expect(all.total).toBe(3);
    const ana = all.rows.find((r) => r.name === "Ana Silva")!;
    expect(ana).toMatchObject({ company: "Acme", email: "ana@acme.io", linkedin: U("ana"), replied: true, inCampaign: true });
    expect((await listPeople(prisma, WS, { filter: "both" })).rows.map((r) => r.name)).toEqual(["Ana Silva"]);
    expect((await listPeople(prisma, WS, { filter: "replied" })).total).toBe(1);
    expect((await listPeople(prisma, WS, { filter: "email" })).total).toBe(2);
    expect((await listPeople(prisma, WS, { q: "eve" })).rows.map((r) => r.name)).toEqual(["Eve"]);
    expect((await listPeople(prisma, "ws-ct-other")).total).toBe(0);
  });

  it("shows everything that happened on every channel, newest first", async () => {
    const id = (await listPeople(prisma, WS, { q: "ana" })).rows[0]!.id;
    expect(await getPerson(prisma, "ws-ct-other", id)).toBeNull();
    const v = (await getPerson(prisma, WS, id))!;
    expect(v.events.map((e) => [e.channel, e.kind])).toEqual([
      ["linkedin", "meeting"],
      ["linkedin", "reply"],
      ["linkedin", "message"],
      ["linkedin", "accepted"],
      ["email", "email"],
      ["linkedin", "invite"],
    ]);
    expect(v.events.find((e) => e.kind === "invite")?.text).toBe("Hi Ana!");
    expect(v.campaigns.map((c) => [c.channel, c.name, c.status])).toEqual([
      ["linkedin", "LI founders", "REPLIED"],
      ["email", "Email Q4", "SKIPPED"],
    ]);
    expect(v.lists).toEqual(["Founders"]);
  });

  it("edits details, checking the phone", async () => {
    const id = (await listPeople(prisma, WS, { q: "bo" })).rows[0]!.id;
    expect(await updatePerson(prisma, WS, id, { phone: "+91 98765 43210", notes: "Met at SaaStr", company: "Bolt" })).toEqual({ ok: true, value: undefined });
    expect(await updatePerson(prisma, WS, id, { phone: "call me" })).toMatchObject({ ok: false });
    expect(await updatePerson(prisma, "ws-ct-other", id, { phone: "123456" })).toMatchObject({ ok: false });
    expect(await prisma.person.findUniqueOrThrow({ where: { id } })).toMatchObject({ phone: "+91 98765 43210", notes: "Met at SaaStr", company: "Bolt" });
  });
});
