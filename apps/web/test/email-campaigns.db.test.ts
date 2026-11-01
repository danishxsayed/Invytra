/** Email campaigns: leads, sequence, mailboxes, launch (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importContacts } from "../src/lib/email-contacts";
import {
  createEmailCampaign,
  deleteEmailCampaign,
  getEmailCampaign,
  addListsToCampaign,
  launchEmailCampaign,
  listEmailCampaigns,
  saveEmailSequence,
  setCampaignMailboxes,
  setEmailCampaignPaused,
} from "../src/lib/email-campaigns";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("email campaigns", () => {
  let prisma: PrismaClient;
  const WS = "ws-ec";
  const OTHER = "ws-ec-2";
  const now = new Date("2026-11-02T05:30:00Z");
  let id = "";
  const box = (bid: string, workspaceId: string, email: string) =>
    prisma.emailAccount.create({ data: { id: bid, workspaceId, email, fromName: "T", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: email, secret: "x" } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "EC" }, { id: OTHER, name: "Other" }] });
    await box("ecm1", WS, "tom@ec.pro");
    await box("ecm-other", OTHER, "x@other.pro");
    // Someone who replied in an earlier campaign isn't emailed again.
    await prisma.emailCampaign.create({ data: { workspaceId: WS, name: "Old", status: "COMPLETED", leads: { create: { workspaceId: WS, email: "replied@before.co", status: "REPLIED" } } } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.$disconnect();
  });

  it("creates a draft that can't launch until it has leads, valid emails and a mailbox", async () => {
    id = (await createEmailCampaign(prisma, WS, "Flooring US") as { value: { id: string } }).value.id;
    const c = (await getEmailCampaign(prisma, WS, id))!;
    expect(c.status).toBe("DRAFT");
    expect(c.problems).toEqual(["Choose at least one mailbox to send from.", "Add leads to email."]);
    expect(await getEmailCampaign(prisma, OTHER, id)).toBeNull();
  });

  it("adds a contact list, skipping anyone who must not be emailed", async () => {
    const csv = "Email,First Name,Company,City\npriya@acme.io,Priya,Acme,Pune\nsam@beta.com,Sam,Beta,\nreplied@before.co,R,X,\nblocked@rival.com,B,Rival,\nbad,,,";
    const imp = await importContacts(prisma, WS, { text: csv, mapping: ["email", "first_name", "company_name", "custom:city"], list: { name: "Nov" } });
    const listId = (imp as { value: { listId: string } }).value.listId;
    await prisma.emailSuppression.create({ data: { workspaceId: WS, email: "@rival.com", reason: "MANUAL" } });
    const r = await addListsToCampaign(prisma, WS, id, [listId], now);
    expect(r).toMatchObject({ ok: true, value: { added: 2, doNotContact: 1, suppressed: 1, alreadyInCampaign: 0 } });
    expect((await addListsToCampaign(prisma, WS, id, [listId], now) as { value: { alreadyInCampaign: number; added: number } }).value).toMatchObject({ added: 0, alreadyInCampaign: 2 });
    const lead = await prisma.emailLead.findFirstOrThrow({ where: { campaignId: id, email: "priya@acme.io" } });
    expect(lead).toMatchObject({ firstName: "Priya", company: "Acme", vars: { city: "Pune" }, nextAt: null, contactId: expect.any(String) });
    expect(await addListsToCampaign(prisma, OTHER, id, [listId])).toMatchObject({ ok: false });
  });

  it("checks the sequence's variables and the mailboxes' owner, then launches", async () => {
    await saveEmailSequence(prisma, WS, id, [{ subject: "Hi {firstName}", body: "About {painPoint}", delayDays: 0 }]);
    expect(await setCampaignMailboxes(prisma, WS, id, ["ecm-other"])).toMatchObject({ ok: false });
    await setCampaignMailboxes(prisma, WS, id, ["ecm1"]);
    expect(await launchEmailCampaign(prisma, WS, id, { when: "now" }, now)).toEqual({ ok: false, error: "Unknown variable {{painPoint}}: create it under Contacts → Variables, or import a CSV column with that name." });
    await saveEmailSequence(prisma, WS, id, [{ subject: "Hi {{first_name|there}}", body: "Is {{city|your city}} busy?", delayDays: 0 }, { subject: "", body: "Bump", delayDays: 3 }]);
    expect(await launchEmailCampaign(prisma, WS, id, { when: "now" }, now)).toEqual({ ok: true, value: undefined });
    expect(await prisma.emailLead.count({ where: { campaignId: id, nextAt: now } })).toBe(2);
    // Running: the emails are locked; new leads start right away.
    expect(await saveEmailSequence(prisma, WS, id, [{ subject: "x", body: "y", delayDays: 0 }])).toMatchObject({ ok: false });
    const more = await importContacts(prisma, WS, { text: "email\nann@gamma.co", mapping: ["email"], list: { name: "More" } });
    await addListsToCampaign(prisma, WS, id, [(more as { value: { listId: string } }).value.listId], now);
    expect((await prisma.emailLead.findFirstOrThrow({ where: { campaignId: id, email: "ann@gamma.co" } })).nextAt).toEqual(now);
  });

  it("pauses and resumes; lists with stats; deletes only its own", async () => {
    expect(await setEmailCampaignPaused(prisma, WS, id, true)).toMatchObject({ ok: true });
    expect(await setCampaignMailboxes(prisma, WS, id, [])).toMatchObject({ ok: true });
    expect(await setEmailCampaignPaused(prisma, WS, id, false)).toEqual({ ok: false, error: "Choose at least one mailbox to send from." });
    await setCampaignMailboxes(prisma, WS, id, ["ecm1"]);
    expect(await setEmailCampaignPaused(prisma, WS, id, false)).toMatchObject({ ok: true });
    const [row] = (await listEmailCampaigns(prisma, WS)).filter((c) => c.id === id);
    expect(row).toMatchObject({ status: "ACTIVE", mailboxes: 1, stats: { leads: 3, active: 3, sent: 0, contacted: 0 } });
    expect(await deleteEmailCampaign(prisma, OTHER, id)).toMatchObject({ ok: false });
    expect(await deleteEmailCampaign(prisma, WS, id)).toMatchObject({ ok: true });
    expect(await prisma.emailLead.count({ where: { campaignId: id } })).toBe(0);
  });
});
