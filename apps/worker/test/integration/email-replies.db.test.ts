/** Email campaign replies and bounces (only with TEST_DATABASE_URL). */
import { PrismaClient, sealSecret, type IncomingMail, type MailboxReader } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailReplyTick } from "../../src/email/replies.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const KEY = Buffer.alloc(32, 4).toString("base64");

d("email replies and bounces", () => {
  let prisma: PrismaClient;
  const WS = "ws-erep";
  const now = new Date("2026-11-03T06:00:00Z");
  let inbox: IncomingMail[] = [];
  let spam: IncomingMail[] = [];
  let failWith: Error | null = null;
  const cursors: unknown[] = [];
  const reader: MailboxReader = {
    read: async (_l, cursor, _since, fromLead) => {
      if (failWith) throw failWith;
      cursors.push(cursor);
      const messages = inbox;
      inbox = [];
      // The real reader keeps only the spam-folder messages fromLead accepts (and moves them).
      for (const m of spam) if (fromLead && (await fromLead({ messageId: m.messageId, fromEmail: m.fromEmail, inReplyTo: m.inReplyTo }))) messages.push({ ...m, fromSpam: true });
      return { uidValidity: 77n, uidNext: 100 + cursors.length, messages };
    },
  };
  const mail = (o: Partial<IncomingMail>): IncomingMail => ({ uid: 1, messageId: `<${Math.random()}@x>`, fromEmail: "", fromName: null, subject: "Re: Hello", date: now, text: "Hi", inReplyTo: null, references: [], kind: "REPLY", bounced: [], ...o });
  const lead = (email: string, campaignId = "er1") => prisma.emailLead.findFirstOrThrow({ where: { campaignId, email } });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Rep" } });
    await prisma.emailAccount.create({
      data: { id: "erm", workspaceId: WS, email: "tom@rep.pro", fromName: "Tom", provider: "OTHER", smtpHost: "smtp.x", smtpPort: 465, smtpSecure: true, imapHost: "imap.x", imapPort: 993, username: "tom@rep.pro", secret: sealSecret("pw", KEY) },
    });
    const sent = new Date("2026-11-02T06:00:00Z");
    const L = (email: string, o: object = {}) => ({ workspaceId: WS, email, emailAccountId: "erm", stepIndex: 1, lastSentAt: sent, nextAt: new Date("2026-11-05T06:00:00Z"), ...o });
    await prisma.emailCampaign.create({
      data: { id: "er1", workspaceId: WS, name: "One", status: "ACTIVE", steps: [], leads: { create: [L("priya@acme.io"), L("sam@beta.com"), L("gone@eps.co"), L("ann@gamma.co"), L("ooo@delta.co")] } },
    });
    await prisma.emailCampaign.create({ data: { id: "er2", workspaceId: WS, name: "Two", status: "ACTIVE", steps: [], leads: { create: [{ workspaceId: WS, email: "priya@acme.io", nextAt: now }] } } });
    await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: "erm", kind: "CAMPAIGN", status: "SENT", toEmail: "ann@gamma.co", subject: "Hello", messageId: "<ann1@x>", emailLeadId: (await lead("ann@gamma.co")).id } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("stops follow-ups on a reply (in every campaign), keeps going on out-of-office, marks bounces", async () => {
    inbox = [
      mail({ fromEmail: "priya@acme.io", fromName: "Priya", text: "Interested!", messageId: "<p@acme>" }),
      mail({ fromEmail: "ooo@delta.co", kind: "AUTO_REPLY", subject: "Out of office" }),
      mail({ fromEmail: "mailer-daemon@mx.x", kind: "BOUNCE", bounced: ["gone@eps.co"], text: "\nUser unknown\n" }),
      // Ann answers from her personal address: matched by the email it replies to.
      mail({ fromEmail: "ann.home@gmail.com", inReplyTo: "<ann1@x>" }),
      mail({ fromEmail: "stranger@nowhere.io" }),
    ];
    expect(await emailReplyTick({ prisma, key: KEY, reader, now })).toEqual({ mailboxes: 1, replies: 2, autoReplies: 1, bounces: 1, fromSpam: 0 });
    expect(await lead("priya@acme.io")).toMatchObject({ status: "REPLIED", nextAt: null, repliedAt: now });
    expect(await lead("priya@acme.io", "er2")).toMatchObject({ status: "REPLIED", reason: "Replied to another campaign" });
    expect(await lead("ann@gamma.co")).toMatchObject({ status: "REPLIED" });
    expect(await lead("ooo@delta.co")).toMatchObject({ status: "ACTIVE" });
    expect(await lead("gone@eps.co")).toMatchObject({ status: "BOUNCED", bounceType: "HARD", reason: "Hard bounce: User unknown" });
    expect(await lead("sam@beta.com")).toMatchObject({ status: "ACTIVE" });
    const replies = await prisma.emailReply.findMany({ where: { workspaceId: WS }, orderBy: { kind: "asc" } });
    expect(replies.map((r) => r.kind).sort()).toEqual(["AUTO_REPLY", "BOUNCE", "REPLY", "REPLY"]);
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id: "erm" } })).toMatchObject({ replyUidValidity: 77n, replyUidNext: 101, lastReplyCheckAt: now });
  });

  it("finds a lead's reply in the spam folder once, and ignores other spam", async () => {
    spam = [mail({ fromEmail: "sam@beta.com", text: "Yes, interested", messageId: "<sam1@beta>" }), mail({ fromEmail: "promo@shop.com", messageId: "<ad@shop>" })];
    const at = new Date(now.getTime() + 10 * 60_000);
    expect(await emailReplyTick({ prisma, key: KEY, reader, now: at })).toMatchObject({ replies: 1, fromSpam: 1 });
    expect(await lead("sam@beta.com")).toMatchObject({ status: "REPLIED" });
    // Still in the spam list on the next read (say the move failed): not counted twice.
    expect(await emailReplyTick({ prisma, key: KEY, reader, now: new Date(at.getTime() + 10 * 60_000) })).toMatchObject({ replies: 0, fromSpam: 0 });
    expect(await prisma.emailReply.count({ where: { fromEmail: "sam@beta.com" } })).toBe(1);
    spam = [];
  });

  it("retries a soft bounce, ignores 'delayed' notices, and honours 'unsubscribe' replies", async () => {
    await prisma.emailLead.createMany({ data: [{ workspaceId: WS, campaignId: "er1", email: "busy@full.co", emailAccountId: "erm", stepIndex: 2, lastSentAt: now, status: "COMPLETED" }, { workspaceId: WS, campaignId: "er1", email: "stopme@x.co", emailAccountId: "erm", stepIndex: 1, lastSentAt: now, nextAt: now }] });
    const busy = await lead("busy@full.co");
    await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: "erm", kind: "CAMPAIGN", status: "SENT", toEmail: "busy@full.co", subject: "x", stepIndex: 1, emailLeadId: busy.id } });
    inbox = [
      mail({ fromEmail: "mailer-daemon@mx.x", kind: "BOUNCE", bounced: ["busy@full.co"], bounceType: "DELAYED" }),
      mail({ fromEmail: "mailer-daemon@mx.x", kind: "BOUNCE", bounced: ["busy@full.co"], bounceType: "SOFT", bounceReason: "452 4.2.2 Mailbox full" }),
      mail({ fromEmail: "stopme@x.co", text: "Unsubscribe me please" }),
    ];
    await emailReplyTick({ prisma, key: KEY, reader, now: new Date(now.getTime() + 30 * 60_000) });
    expect(await lead("busy@full.co")).toMatchObject({ status: "ACTIVE", stepIndex: 1, softBounces: 1, reason: expect.stringContaining("Mailbox full") });
    expect(await lead("stopme@x.co")).toMatchObject({ status: "UNSUBSCRIBED", nextAt: null });
    expect(await prisma.emailSuppression.findFirst({ where: { workspaceId: WS, email: "stopme@x.co" } })).toMatchObject({ reason: "UNSUBSCRIBED" });
  });

  it("records why reading failed, and clears it once it works", async () => {
    failWith = Object.assign(new Error("Invalid credentials"), { authenticationFailed: true });
    await emailReplyTick({ prisma, key: KEY, reader, now: new Date(now.getTime() + 60 * 60_000) });
    expect((await prisma.emailAccount.findUniqueOrThrow({ where: { id: "erm" } })).replyError).toMatch(/didn't accept/);
    failWith = null;
    await emailReplyTick({ prisma, key: KEY, reader, now: new Date(now.getTime() + 70 * 60_000) });
    expect((await prisma.emailAccount.findUniqueOrThrow({ where: { id: "erm" } })).replyError).toBeNull();
  });

  it("reads each mailbox every few minutes, from where it stopped", async () => {
    const base = new Date(now.getTime() + 70 * 60_000);
    const before = cursors.length;
    expect((await emailReplyTick({ prisma, key: KEY, reader, now: new Date(base.getTime() + 60_000) })).mailboxes).toBe(0);
    await emailReplyTick({ prisma, key: KEY, reader, now: new Date(base.getTime() + 4 * 60_000) });
    expect(cursors.length).toBe(before + 1);
    expect(cursors.at(-1)).toEqual({ uidValidity: 77n, uidNext: 100 + before });
  });
});
