/** Email inbox: conversations, thread, replying, done (only with TEST_DATABASE_URL). */
import { PrismaClient, sealSecret, type MailSender } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getConversation, inboxCounts, listConversations, sendEmailReply, setConversationDone } from "../src/lib/email-inbox";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("email inbox", () => {
  let prisma: PrismaClient;
  const WS = "ws-einbox";
  const OTHER = "ws-einbox-2";
  const t = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
  const sent: { to: string; subject: string; text: string; inReplyTo?: string; from: string }[] = [];
  const sender: MailSender = { send: async (_l, m) => (sent.push(m), { messageId: "<you1@x>" }) };
  let priya = "";

  beforeAll(async () => {
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "Inbox" }, { id: OTHER, name: "Other" }] });
    await prisma.emailAccount.create({
      data: { id: "eib", workspaceId: WS, email: "tom@inbox.pro", fromName: "Tom", provider: "OTHER", smtpHost: "smtp.x", smtpPort: 465, smtpSecure: true, imapHost: "imap.x", imapPort: 993, username: "tom@inbox.pro", secret: sealSecret("pw", process.env.SESSION_ENCRYPTION_KEY!), signature: "Tom" },
    });
    const c = await prisma.emailCampaign.create({ data: { workspaceId: WS, name: "Flooring", status: "ACTIVE", steps: [] } });
    const lead = (email: string, o: object = {}) => prisma.emailLead.create({ data: { workspaceId: WS, campaignId: c.id, email, emailAccountId: "eib", threadSubject: "Hello", threadMessageId: "<m1@x>", ...o } });
    const p = await lead("priya@acme.io", { firstName: "Priya", company: "Acme", status: "REPLIED", repliedAt: t(5) });
    priya = p.id;
    const ooo = await lead("ooo@b.co");
    await prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: "eib", emailLeadId: p.id, kind: "CAMPAIGN", status: "SENT", toEmail: p.email, subject: "Hello", text: "Hi Priya\n\nTom", stepIndex: 0, messageId: "<m1@x>", createdAt: t(3) } });
    await prisma.emailReply.createMany({
      data: [
        { workspaceId: WS, emailAccountId: "eib", emailLeadId: p.id, kind: "REPLY", fromEmail: "priya@acme.io", fromName: "Priya Shah", subject: "Re: Hello", text: "Interested, send details", messageId: "<p1@acme>", receivedAt: t(5) },
        { workspaceId: WS, emailAccountId: "eib", emailLeadId: ooo.id, kind: "AUTO_REPLY", fromEmail: "ooo@b.co", subject: "Out of office", text: "Away", receivedAt: t(4) },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    await prisma.$disconnect();
  });

  it("lists replies that need an answer, and keeps auto-replies apart", async () => {
    const needs = await listConversations(prisma, WS, "needs");
    expect(needs).toMatchObject([{ leadId: priya, name: "Priya", campaign: "Flooring", unread: 1, needsReply: true, preview: "Interested, send details" }]);
    expect((await listConversations(prisma, WS, "auto")).map((r) => r.email)).toEqual(["ooo@b.co"]);
    expect(await listConversations(prisma, OTHER, "all")).toEqual([]);
    expect(await inboxCounts(prisma, WS)).toEqual({ needs: 1, unread: 1 });
  });

  it("shows the whole thread in order and marks it read", async () => {
    const c = (await getConversation(prisma, WS, priya, t(6)))!;
    expect(c.items.map((i) => `${i.kind}:${i.text}`)).toEqual(["CAMPAIGN:Hi Priya\n\nTom", "REPLY:Interested, send details"]);
    expect(c.needsReply).toBe(true);
    expect((await inboxCounts(prisma, WS)).unread).toBe(0);
    expect(await getConversation(prisma, OTHER, priya)).toBeNull();
  });

  it("replies from the lead's mailbox, threaded, and it no longer needs a reply", async () => {
    expect(await sendEmailReply(prisma, OTHER, priya, "x", { sender })).toMatchObject({ ok: false });
    expect(await sendEmailReply(prisma, WS, priya, "Here you go!", { sender, now: t(7) })).toEqual({ ok: true, value: undefined });
    expect(sent[0]).toMatchObject({ from: "tom@inbox.pro", to: "priya@acme.io", subject: "Re: Hello", inReplyTo: "<p1@acme>", text: "Here you go!\n\nTom" });
    expect(await listConversations(prisma, WS, "needs")).toEqual([]);
    const [row] = await listConversations(prisma, WS, "all");
    expect(row).toMatchObject({ fromThem: false, preview: "You: Here you go! Tom" });
    // They write again: it needs a reply again.
    await prisma.emailReply.create({ data: { workspaceId: WS, emailAccountId: "eib", emailLeadId: priya, kind: "REPLY", fromEmail: "priya@acme.io", subject: "Re: Hello", text: "Thanks! Call Tuesday?", receivedAt: t(9) } });
    expect((await listConversations(prisma, WS, "needs")).length).toBe(1);
  });

  it("marks a conversation done until they write again", async () => {
    await setConversationDone(prisma, WS, priya, true, t(10));
    expect(await listConversations(prisma, WS, "needs")).toEqual([]);
    expect((await getConversation(prisma, WS, priya))!.done).toBe(true);
    await prisma.emailReply.create({ data: { workspaceId: WS, emailAccountId: "eib", emailLeadId: priya, kind: "REPLY", fromEmail: "priya@acme.io", subject: "Re: Hello", text: "Ping", receivedAt: t(11) } });
    expect((await listConversations(prisma, WS, "needs")).length).toBe(1);
    expect(await setConversationDone(prisma, OTHER, priya, true)).toMatchObject({ ok: false });
  });
});
