/** Email campaign engine (only with TEST_DATABASE_URL). */
import { PrismaClient, sealSecret, type MailSender } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailCampaignTick } from "../../src/email/campaigns.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const KEY = Buffer.alloc(32, 5).toString("base64");

d("email campaign engine", () => {
  let prisma: PrismaClient;
  const WS = "ws-ecamp";
  let now = new Date("2026-11-02T05:30:00Z"); // Mon 11:00 Kolkata
  const sent: { from: string; to: string; subject: string; text: string; inReplyTo?: string; headers?: Record<string, string>; html?: string; image?: number }[] = [];
  let refuse = new Set<string>();
  const sender: MailSender = {
    send: async (_l, m) => {
      if (refuse.has(m.to)) throw Object.assign(new Error("x"), { responseCode: 550, response: "550 5.1.1 No such user" });
      sent.push({ from: m.from, to: m.to, subject: m.subject, text: m.text, inReplyTo: m.inReplyTo, headers: m.headers, html: m.html, image: m.image?.png.length });
      return { messageId: `<m${sent.length}@x>` };
    },
  };
  const tick = () => emailCampaignTick({ prisma, key: KEY, sender, now, rand: () => 0, origin: "https://app.invytra.test" });
  const mins = (n: number) => (now = new Date(now.getTime() + n * 60_000));
  const lead = (email: string) => prisma.emailLead.findFirstOrThrow({ where: { campaignId: "ec1", email } });

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.emailCampaign.updateMany({ where: { status: "ACTIVE" }, data: { status: "PAUSED" } }); // only this test's campaign runs
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Camp" } });
    for (const [id, email] of [["em1", "tom@camp-a.pro"], ["em2", "jerry@camp-a.pro"]]) {
      await prisma.emailAccount.create({
        data: { id, workspaceId: WS, email, fromName: id === "em1" ? "Tom" : "Jerry", provider: "OTHER", smtpHost: "smtp.x", smtpPort: 465, smtpSecure: true, imapHost: "imap.x", imapPort: 993, username: email, secret: sealSecret("pw", KEY), timeZone: "Asia/Kolkata", gapMinutes: 6, signature: id === "em1" ? "Tom\nCamp A" : "" },
      });
    }
    await prisma.emailCampaign.create({
      data: {
        id: "ec1",
        workspaceId: WS,
        name: "Test",
        status: "ACTIVE",
        unsubscribeLink: false,
        launchedAt: now,
        columns: ["city"],
        steps: [
          { subject: "Hello {firstName|there}", body: "Hi {firstName|there}, how is {city|your city}? Do you work at {company}?", delayDays: 0 },
          { subject: "", body: "Following up, {firstName|there}.", delayDays: 3 },
        ],
        mailboxes: { create: [{ emailAccountId: "em1" }, { emailAccountId: "em2" }] },
        leads: {
          create: [
            { workspaceId: WS, email: "priya@acme.io", firstName: "Priya", company: "Acme", vars: { city: "Pune" }, nextAt: now },
            { workspaceId: WS, email: "sam@beta.com", company: "Beta", nextAt: new Date(now.getTime() + 1) },
            { workspaceId: WS, email: "ann@gamma.co", company: "Gamma", nextAt: new Date(now.getTime() + 2) },
            { workspaceId: WS, email: "nocompany@delta.co", nextAt: new Date(now.getTime() + 3) },
            { workspaceId: WS, email: "gone@epsilon.co", company: "Eps", nextAt: new Date(now.getTime() + 4) },
          ],
        },
      },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    await prisma.$disconnect();
  });

  it("sends one email per mailbox per gap, rotating, written for each lead", async () => {
    mins(1);
    expect(await tick()).toMatchObject({ sent: 2 });
    expect(sent.map((s) => `${s.from}→${s.to}`)).toEqual(["tom@camp-a.pro→priya@acme.io", "jerry@camp-a.pro→sam@beta.com"]);
    expect(sent[0]).toMatchObject({ subject: "Hello Priya", text: "Hi Priya, how is Pune? Do you work at Acme?\n\nTom\nCamp A" });
    expect(sent[1]).toMatchObject({ subject: "Hello there", text: "Hi there, how is your city? Do you work at Beta?" });
    // Both mailboxes wait out their gap.
    mins(3);
    expect(await tick()).toMatchObject({ sent: 0 });
    mins(4);
    refuse = new Set(["gone@epsilon.co"]);
    expect(await tick()).toMatchObject({ sent: 1, skipped: 1, bounced: 1 });
    expect(await lead("nocompany@delta.co")).toMatchObject({ status: "SKIPPED", reason: expect.stringContaining("{company}") });
    expect(await lead("gone@epsilon.co")).toMatchObject({ status: "BOUNCED", bounceType: "HARD", reason: expect.stringContaining("No such user") });
    // A hard bounce is never emailed again by any campaign.
    expect(await prisma.emailSuppression.findFirst({ where: { workspaceId: WS, email: "gone@epsilon.co" } })).toMatchObject({ reason: "HARD_BOUNCE" });
    // Every email carries the one-click unsubscribe header, even with the visible line off.
    expect(sent[0]!.headers).toMatchObject({ "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "List-Unsubscribe": expect.stringMatching(/^<https:\/\/app\.invytra\.test\/api\/unsubscribe\/.+>, <mailto:tom@camp-a\.pro\?subject=unsubscribe>$/) });
    expect(await lead("priya@acme.io")).toMatchObject({ stepIndex: 1, emailAccountId: "em1", threadMessageId: "<m1@x>", threadSubject: "Hello Priya", status: "ACTIVE" });
  });

  it("sends follow-ups from the same mailbox, threaded, after the delay; then completes", async () => {
    sent.length = 0;
    mins(60 * 24);
    expect(await tick()).toMatchObject({ sent: 0 }); // only 1 day later
    now = new Date("2026-11-05T06:00:00Z"); // Thu 11:30 Kolkata, 3 days on
    await tick();
    mins(10);
    await tick();
    const toPriya = sent.find((s) => s.to === "priya@acme.io")!;
    expect(toPriya).toMatchObject({ from: "tom@camp-a.pro", subject: "Re: Hello Priya", inReplyTo: "<m1@x>", text: "Following up, Priya.\n\nTom\nCamp A" });
    expect(sent.find((s) => s.to === "sam@beta.com")?.from).toBe("jerry@camp-a.pro");
    expect(await lead("priya@acme.io")).toMatchObject({ status: "COMPLETED", nextAt: null, stepIndex: 2 });
    expect((await prisma.emailCampaign.findUniqueOrThrow({ where: { id: "ec1" } })).status).toBe("COMPLETED");
    expect(await prisma.emailSend.count({ where: { emailLead: { campaignId: "ec1" }, kind: "CAMPAIGN", status: "SENT" } })).toBe(6);
  });

  it("never emails unsubscribed or suppressed people, and uses variable defaults", async () => {
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "ACTIVE", steps: [{ subject: "Hi", body: "About {{pain_point}}", delayDays: 0 }] } });
    await prisma.emailAccount.updateMany({ where: { id: { in: ["em1", "em2"] } }, data: { nextSendAt: null } });
    const contact = await prisma.emailContact.create({ data: { workspaceId: WS, email: "unsub@z.co", subscribed: false } });
    await prisma.emailSuppression.create({ data: { workspaceId: WS, email: "@blocked.co", reason: "MANUAL" } });
    await prisma.emailVariable.create({ data: { workspaceId: WS, key: "pain_point", label: "Pain point", fallback: "slow months" } });
    await prisma.emailLead.createMany({
      data: [
        { workspaceId: WS, campaignId: "ec1", email: "unsub@z.co", contactId: contact.id, nextAt: now },
        { workspaceId: WS, campaignId: "ec1", email: "anyone@blocked.co", nextAt: now },
        { workspaceId: WS, campaignId: "ec1", email: "ok@fine.co", nextAt: now },
      ],
    });
    now = new Date("2026-11-05T07:00:00Z");
    sent.length = 0;
    expect(await tick()).toMatchObject({ skipped: 2, sent: 1 });
    expect(await lead("unsub@z.co")).toMatchObject({ status: "SKIPPED", reason: "Unsubscribed" });
    expect(await lead("anyone@blocked.co")).toMatchObject({ status: "SKIPPED", reason: "On the suppression list" });
    expect(sent[0]).toMatchObject({ to: "ok@fine.co", text: expect.stringContaining("About slow months") });
    await prisma.emailLead.deleteMany({ where: { email: { in: ["unsub@z.co", "anyone@blocked.co", "ok@fine.co"] } } });
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "COMPLETED" } });
  });

  it("adds the unsubscribe line when the campaign wants it, and retries soft bounces", async () => {
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "ACTIVE", unsubscribeLink: true, unsubscribeText: "No more? [Click here]", softBounceRetries: 1, softRetryHours: 2, steps: [{ subject: "Hi", body: "Hello", delayDays: 0 }] } });
    await prisma.emailAccount.updateMany({ where: { id: { in: ["em1", "em2"] } }, data: { nextSendAt: null } });
    await prisma.emailLead.createMany({ data: [{ workspaceId: WS, campaignId: "ec1", email: "full@box.co", nextAt: now }] });
    sent.length = 0;
    const full = new Set(["full@box.co"]);
    const busy: MailSender = { send: async (l, m) => (full.has(m.to) ? Promise.reject(Object.assign(new Error("x"), { responseCode: 452, command: "RCPT TO", response: "452 4.2.2 Mailbox full" })) : sender.send(l, m)) };
    const run = () => emailCampaignTick({ prisma, key: KEY, sender: busy, now, rand: () => 0, origin: "https://app.invytra.test" });
    expect(await run()).toMatchObject({ bounced: 1 });
    const l1 = await lead("full@box.co");
    expect(l1).toMatchObject({ status: "ACTIVE", softBounces: 1, stepIndex: 0, nextAt: new Date(now.getTime() + 2 * 3_600_000) });
    now = new Date(now.getTime() + 2 * 3_600_000 + 60_000);
    await prisma.emailAccount.updateMany({ where: { id: { in: ["em1", "em2"] } }, data: { nextSendAt: null } });
    await run();
    expect(await lead("full@box.co")).toMatchObject({ status: "BOUNCED", bounceType: "SOFT", softBounces: 2 });
    // Soft bounces aren't suppressed: the address may work later.
    expect(await prisma.emailSuppression.findFirst({ where: { workspaceId: WS, email: "full@box.co" } })).toBeNull();
    // The visible line, linked to this lead's page.
    full.clear();
    await prisma.emailLead.create({ data: { workspaceId: WS, campaignId: "ec1", email: "line@ok.co", nextAt: now } });
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "ACTIVE" } }); // it finished when the last lead bounced
    await prisma.emailAccount.updateMany({ where: { id: { in: ["em1", "em2"] } }, data: { nextSendAt: null } });
    await run();
    expect(sent.at(-1)!.text).toMatch(/No more\? Click here: https:\/\/app\.invytra\.test\/unsubscribe\/\w+\.[\w-]+$/);
    await prisma.emailLead.deleteMany({ where: { email: { in: ["full@box.co", "line@ok.co"] } } });
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "COMPLETED", unsubscribeLink: false } });
  });

  it("starts a scheduled campaign when its time comes", async () => {
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "SCHEDULED", scheduledAt: new Date(now.getTime() + 60 * 60_000) } });
    expect(await tick()).toMatchObject({ started: 0 });
    now = new Date(now.getTime() + 61 * 60_000);
    expect(await tick()).toMatchObject({ started: 1 });
    expect((await prisma.emailCampaign.findUniqueOrThrow({ where: { id: "ec1" } })).status).not.toBe("SCHEDULED");
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "COMPLETED" } });
  });

  it("respects the daily limit and sending hours", async () => {
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "ACTIVE" } });
    await prisma.emailLead.createMany({ data: ["x1@z.co", "x2@z.co"].map((email) => ({ workspaceId: WS, campaignId: "ec1", email, company: "Z", nextAt: now })) });
    await prisma.emailAccount.updateMany({ where: { id: { in: ["em1", "em2"] } }, data: { dailyLimit: 1, nextSendAt: null } });
    mins(30);
    expect(await tick()).toMatchObject({ sent: 0 }); // both already sent today
    now = new Date("2026-11-05T19:00:00Z"); // Fri 00:30 Kolkata: a new day, but before sending hours
    expect(await tick()).toMatchObject({ sent: 0 });
    now = new Date("2026-11-06T04:00:00Z"); // Fri 09:30
    expect(await tick()).toMatchObject({ sent: 2 });
  });

  it("draws a handwritten card into the email (2 AI credits), and sends without it when credits run out", async () => {
    await prisma.emailCampaign.update({ where: { id: "ec1" }, data: { status: "COMPLETED" } });
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 0, aiExtra: 0, aiPeriod: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } });
    await prisma.emailAccount.create({
      data: { id: "em3", workspaceId: WS, email: "card@camp-a.pro", fromName: "Card", provider: "OTHER", smtpHost: "smtp.x", smtpPort: 465, smtpSecure: true, imapHost: "imap.x", imapPort: 993, username: "card@camp-a.pro", secret: sealSecret("pw", KEY), timeZone: "Asia/Kolkata", gapMinutes: 1 },
    });
    await prisma.emailCampaign.create({
      data: {
        id: "ec-card", workspaceId: WS, name: "Cards", status: "ACTIVE", unsubscribeLink: false, launchedAt: now,
        steps: [{ subject: "Hi", body: "Hi {firstName|there}, a note for you.", delayDays: 0, card: { text: "Thanks {firstName|friend}!", style: "lined", font: "quick" } }],
        mailboxes: { create: [{ emailAccountId: "em3" }] },
        leads: { create: [{ workspaceId: WS, email: "lia@card.co", firstName: "Lia", nextAt: now }, { workspaceId: WS, email: "max@card.co", firstName: "Max", nextAt: new Date(now.getTime() + 1) }] },
      },
    });
    const n0 = sent.length;
    expect(await tick()).toMatchObject({ sent: 1 });
    expect(sent[n0]).toMatchObject({ to: "lia@card.co" });
    expect(sent[n0]!.image).toBeGreaterThan(5_000);
    expect(sent[n0]!.html).toContain('src="cid:card@invytra"');
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "HANDWRITTEN", credits: 2 } })).toBe(1);

    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 1000 } });
    mins(5);
    expect(await tick()).toMatchObject({ sent: 1 });
    expect(sent[n0 + 1]).toMatchObject({ to: "max@card.co", image: undefined });
    expect(sent[n0 + 1]!.html).not.toContain("cid:");
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "HANDWRITTEN" } })).toBe(1);
  });
});
