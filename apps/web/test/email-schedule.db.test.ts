/** Scheduling email campaigns (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importContacts } from "../src/lib/email-contacts";
import { addListsToCampaign, cancelEmailCampaign, createEmailCampaign, launchEmailCampaign, saveEmailSequence, setCampaignMailboxes } from "../src/lib/email-campaigns";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("scheduling email campaigns", () => {
  let prisma: PrismaClient;
  const WS = "ws-sched";
  const now = new Date("2026-11-02T05:30:00Z"); // Mon 11:00 Kolkata
  let id = "";
  const nextOf = async (email: string) => (await prisma.emailLead.findFirstOrThrow({ where: { campaignId: id, email } })).nextAt;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Sched" } });
    await prisma.emailAccount.create({ data: { id: "sched-box", workspaceId: WS, email: "t@s.pro", fromName: "T", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: "t", secret: "x" } });
    id = ((await createEmailCampaign(prisma, WS, "Later")) as { value: { id: string } }).value.id;
    await saveEmailSequence(prisma, WS, id, [{ subject: "Hi", body: "Hello", delayDays: 0 }]);
    await setCampaignMailboxes(prisma, WS, id, ["sched-box"]);
    const imp = await importContacts(prisma, WS, { text: "email,timezone\nus@x.co,America/Chicago\nin@x.co,\n", mapping: ["email", "custom:timezone"], list: { name: "L" } });
    await addListsToCampaign(prisma, WS, id, [(imp as { value: { listId: string } }).value.listId], now);
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("refuses a time in the past", async () => {
    expect(await launchEmailCampaign(prisma, WS, id, { when: "later", local: "2026-11-01T09:00", timeZone: "Asia/Kolkata", recipientTz: false }, now)).toMatchObject({ ok: false, error: expect.stringContaining("passed") });
  });

  it("schedules for a date and time in a time zone, or each recipient's own", async () => {
    expect(await launchEmailCampaign(prisma, WS, id, { when: "later", local: "2026-11-05T09:00", timeZone: "Asia/Kolkata", recipientTz: false }, now)).toEqual({ ok: true, value: undefined });
    expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "SCHEDULED", scheduledAt: new Date("2026-11-05T03:30:00Z"), scheduleLocal: "2026-11-05T09:00" });
    expect(await nextOf("us@x.co")).toEqual(new Date("2026-11-05T03:30:00Z"));
    // Rescheduled, by each recipient's own time zone when known.
    await launchEmailCampaign(prisma, WS, id, { when: "later", local: "2026-11-05T09:00", timeZone: "Asia/Kolkata", recipientTz: true }, now);
    expect(await nextOf("us@x.co")).toEqual(new Date("2026-11-05T15:00:00Z")); // 09:00 in Chicago
    expect(await nextOf("in@x.co")).toEqual(new Date("2026-11-05T03:30:00Z"));
    expect((await prisma.emailCampaign.findUniqueOrThrow({ where: { id } })).scheduledAt).toEqual(new Date("2026-11-05T03:30:00Z"));
    // Leads added while scheduled get the same schedule.
    const more = await importContacts(prisma, WS, { text: "email,tz\nla@x.co,America/Los_Angeles", mapping: ["email", "custom:tz"], list: { name: "M" } });
    await addListsToCampaign(prisma, WS, id, [(more as { value: { listId: string } }).value.listId], now);
    expect(await nextOf("la@x.co")).toEqual(new Date("2026-11-05T17:00:00Z"));
    // The emails can still change.
    expect(await saveEmailSequence(prisma, WS, id, [{ subject: "Hello", body: "New text", delayDays: 0 }])).toMatchObject({ ok: true });
  });

  it("can switch to send now, and be cancelled for good", async () => {
    expect(await launchEmailCampaign(prisma, WS, id, { when: "now" }, now)).toMatchObject({ ok: true });
    expect(await prisma.emailCampaign.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "ACTIVE", scheduledAt: null });
    expect(await nextOf("us@x.co")).toEqual(now);
    expect(await cancelEmailCampaign(prisma, WS, id)).toMatchObject({ ok: true });
    expect(await prisma.emailLead.count({ where: { campaignId: id, status: "ACTIVE" } })).toBe(0);
    expect(await launchEmailCampaign(prisma, WS, id, { when: "now" }, now)).toMatchObject({ ok: false });
    expect(await cancelEmailCampaign(prisma, WS, id)).toMatchObject({ ok: false });
  });
});
