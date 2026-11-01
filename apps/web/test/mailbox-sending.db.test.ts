/** Email Outreach sending settings, pause and test email (only with TEST_DATABASE_URL). */
import { PrismaClient, sealSecret, type MailSender } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendTestEmail, sentToday, setMailboxPaused, updateMailboxSettings } from "../src/lib/mailbox-sending";
import { listMailboxes } from "../src/lib/mailboxes";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("Email Outreach sending", () => {
  let prisma: PrismaClient;
  const WS = "ws-send";
  const OTHER = "ws-send-2";
  let id = "";
  const sent: { to: string; text: string; from: string }[] = [];
  const sender: MailSender = { send: async (_l, m) => (sent.push(m), { messageId: `<${sent.length}@trycrawlers.pro>` }) };
  const now = new Date("2026-11-02T05:30:00Z"); // 11:00 in Kolkata

  beforeAll(async () => {
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "Send" }, { id: OTHER, name: "Other" }] });
    const m = await prisma.emailAccount.create({
      data: {
        workspaceId: WS,
        email: "tom@send-test.pro",
        fromName: "Tom",
        provider: "HOSTINGER",
        smtpHost: "smtp.hostinger.com",
        smtpPort: 465,
        smtpSecure: true,
        imapHost: "imap.hostinger.com",
        imapPort: 993,
        username: "tom@send-test.pro",
        secret: sealSecret("pw", process.env.SESSION_ENCRYPTION_KEY!),
      },
    });
    id = m.id;
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    await prisma.$disconnect();
  });

  it("saves sending settings, only in its own workspace", async () => {
    const s = { fromName: "Tommy", dailyLimit: 2, gapMinutes: 8, timeZone: "Asia/Kolkata", days: [5, 1, 1], startHour: 10, endHour: 17, signature: "Tommy\nCrawlers" };
    expect(await updateMailboxSettings(prisma, OTHER, id, s)).toMatchObject({ ok: false });
    expect(await updateMailboxSettings(prisma, WS, id, s)).toEqual({ ok: true, value: undefined });
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id } })).toMatchObject({ fromName: "Tommy", dailyLimit: 2, gapMinutes: 8, sendDays: [1, 5], startHour: 10, endHour: 17 });
  });

  it("sends a test email with the signature, logs it, and stops at the daily limit", async () => {
    expect(await sendTestEmail(prisma, OTHER, id, "a@b.co", { sender, now })).toMatchObject({ ok: false });
    expect(await sendTestEmail(prisma, WS, id, "me@gmail.com", { sender, now })).toEqual({ ok: true, value: { messageId: "<1@trycrawlers.pro>" } });
    expect(sent[0]).toMatchObject({ to: "me@gmail.com", from: "tom@send-test.pro", text: expect.stringContaining("Tommy\nCrawlers") });
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id } })).toMatchObject({ lastSentAt: now });

    // A failed send is logged but doesn't count toward the limit.
    const fail: MailSender = { send: async () => Promise.reject(Object.assign(new Error("x"), { responseCode: 550, response: "550 User unknown" })) };
    expect(await sendTestEmail(prisma, WS, id, "nobody@b.co", { sender: fail, now })).toMatchObject({ ok: false, error: expect.stringContaining("refused") });
    expect(await prisma.emailSend.count({ where: { emailAccountId: id } })).toBe(2);

    expect(await sendTestEmail(prisma, WS, id, "me@gmail.com", { sender, now })).toMatchObject({ ok: true });
    expect(await sendTestEmail(prisma, WS, id, "me@gmail.com", { sender, now })).toMatchObject({ ok: false, error: expect.stringContaining("2 of its 2") });
    expect((await sentToday(prisma, [{ id, timeZone: "Asia/Kolkata" }], now)).get(id)).toBe(2);
    // The next day in Kolkata starts a new count.
    expect((await sentToday(prisma, [{ id, timeZone: "Asia/Kolkata" }], new Date("2026-11-02T19:00:00Z"))).get(id)).toBe(0);
    const [row] = await listMailboxes(prisma, WS, now);
    expect(row).toMatchObject({ sentToday: 2, signature: "Tommy\nCrawlers" });
    expect(Object.keys(row!)).not.toContain("secret");
  });

  it("pauses and resumes", async () => {
    expect(await setMailboxPaused(prisma, OTHER, id, true)).toMatchObject({ ok: false });
    await setMailboxPaused(prisma, WS, id, true);
    expect((await prisma.emailAccount.findUniqueOrThrow({ where: { id } })).status).toBe("PAUSED");
    await setMailboxPaused(prisma, WS, id, false);
    expect((await prisma.emailAccount.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  });
});
