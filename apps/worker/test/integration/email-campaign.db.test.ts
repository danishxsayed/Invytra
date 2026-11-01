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
  const sent: { from: string; to: string; subject: string; text: string; inReplyTo?: string }[] = [];
  let refuse = new Set<string>();
  const sender: MailSender = {
    send: async (_l, m) => {
      if (refuse.has(m.to)) throw Object.assign(new Error("x"), { responseCode: 550, response: "550 5.1.1 No such user" });
      sent.push({ from: m.from, to: m.to, subject: m.subject, text: m.text, inReplyTo: m.inReplyTo });
      return { messageId: `<m${sent.length}@x>` };
    },
  };
  const tick = () => emailCampaignTick({ prisma, key: KEY, sender, now, rand: () => 0 });
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
    expect(await lead("gone@epsilon.co")).toMatchObject({ status: "BOUNCED", reason: expect.stringContaining("No such user") });
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
});
