/** Email warm-up between pool mailboxes (only with TEST_DATABASE_URL). */
import { PrismaClient, sealSecret, type MailSender, type WarmupInbox } from "@invytra/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { warmupTick } from "../../src/email/warmup.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const KEY = Buffer.alloc(32, 9).toString("base64");

d("email warm-up", () => {
  let prisma: PrismaClient;
  const WS = "ws-warm";
  const OTHER = "ws-warm-2";
  // Mon 2 Nov 2026, 11:00 in Kolkata; warm-up started that morning (day 1: 2 emails).
  let now = new Date("2026-11-02T05:30:00Z");
  const sent: { from: string; to: string; subject: string; text: string; inReplyTo?: string }[] = [];
  const sender: MailSender = { send: async (l, m) => (sent.push({ from: m.from, to: m.to, subject: m.subject, text: m.text, inReplyTo: m.inReplyTo }), { messageId: `<${sent.length}@x>` }) };
  /** Where each code "landed" in the receiving mailbox. */
  const landing = new Map<string, "INBOX" | "SPAM">();
  const opened: string[] = [];
  const inbox: WarmupInbox = {
    open: async (l) => (opened.push(l.username), { handle: async (code) => landing.get(code) ?? null, close: async () => undefined }),
  };
  const tick = (rand = () => 0) => warmupTick({ prisma, key: KEY, sender, inbox, now, rand });
  const box = (id: string, workspaceId: string, email: string, o: object = {}) =>
    prisma.emailAccount.create({
      data: {
        id,
        workspaceId,
        email,
        fromName: id,
        provider: "OTHER",
        smtpHost: "smtp.x",
        smtpPort: 465,
        smtpSecure: true,
        imapHost: "imap.x",
        imapPort: 993,
        username: email,
        secret: sealSecret("pw", KEY),
        timeZone: "Asia/Kolkata",
        warmupEnabled: true,
        warmupStartedAt: new Date("2026-11-02T03:00:00Z"),
        ...o,
      },
    });

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true";
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.emailAccount.updateMany({ where: { warmupEnabled: true }, data: { warmupEnabled: false } }); // only this test's pool
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "Warm" }, { id: OTHER, name: "Other" }] });
    await box("wa", WS, "tom@warm-a.pro");
    await box("wb", OTHER, "sam@warm-b.io");
    await box("wc", WS, "off@warm-c.pro", { warmupEnabled: false });
  });
  beforeEach(() => {
    sent.length = 0;
    opened.length = 0;
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    await prisma.$disconnect();
  });

  it("sends each due pool mailbox one warm-up email to another pool mailbox", async () => {
    expect(await tick()).toMatchObject({ sent: 2, failed: 0 });
    expect(sent.map((s) => `${s.from}→${s.to}`).sort()).toEqual(["sam@warm-b.io→tom@warm-a.pro", "tom@warm-a.pro→sam@warm-b.io"]);
    const rows = await prisma.emailSend.findMany({ where: { kind: "WARMUP" } });
    expect(rows.every((r) => r.warmupCode && sent.some((s) => s.text.includes(r.warmupCode!)))).toBe(true);
    // Not again right away (spread over the day), and the mailbox that's off never sends.
    expect(await tick()).toMatchObject({ sent: 0 });
    expect(sent.some((s) => s.from.includes("off@") || s.to.includes("off@"))).toBe(false);
  });

  it("records where each landed, rescues spam, and replies to some", async () => {
    const rows = await prisma.emailSend.findMany({ where: { kind: "WARMUP" }, orderBy: { emailAccountId: "asc" } });
    landing.set(rows[0]!.warmupCode!, "INBOX"); // from wa
    landing.set(rows[1]!.warmupCode!, "SPAM"); // from wb
    // Too early to look.
    now = new Date(now.getTime() + 2 * 60_000);
    expect(await tick()).toMatchObject({ checked: 0 });
    now = new Date(now.getTime() + 10 * 60_000);
    const r = await tick(() => 0); // rand 0 → always reply
    expect(r).toMatchObject({ checked: 2, spam: 1, replied: 2 });
    expect(opened.sort()).toEqual(["sam@warm-b.io", "tom@warm-a.pro"]);
    expect((await prisma.emailSend.findUniqueOrThrow({ where: { id: rows[1]!.id } })).landedIn).toBe("SPAM");
    const replies = await prisma.emailSend.findMany({ where: { isReply: true } });
    expect(replies).toHaveLength(2);
    expect(sent.filter((s) => s.inReplyTo).map((s) => s.subject.startsWith("Re: "))).toEqual([true, true]);
    // Replies are checked too, but never replied to.
    for (const x of replies) landing.set(x.warmupCode!, "INBOX");
    now = new Date(now.getTime() + 10 * 60_000);
    expect(await tick()).toMatchObject({ checked: 2, replied: 0 });
  });

  it("marks never-found warm-ups missing after a day, and stops a mailbox that keeps failing", async () => {
    // wa sends one that never arrives.
    now = new Date("2026-11-03T05:30:00Z");
    await tick();
    const lost = await prisma.emailSend.findFirstOrThrow({ where: { kind: "WARMUP", landedIn: null, isReply: false, emailAccountId: "wa" } });
    now = new Date("2026-11-04T06:00:00Z");
    await tick();
    expect((await prisma.emailSend.findUniqueOrThrow({ where: { id: lost.id } })).landedIn).toBe("MISSING");

    const failing: MailSender = { send: async () => Promise.reject(Object.assign(new Error("Invalid login"), { code: "EAUTH" })) };
    for (let i = 0; i < 3; i++) {
      now = new Date(now.getTime() + 120 * 60_000); // day 3: 6 a day over 9 h = one every 90 min
      await warmupTick({ prisma, key: KEY, sender: failing, inbox, now, rand: () => 0 });
    }
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id: "wa" } })).toMatchObject({ status: "ERROR", statusReason: expect.stringContaining("didn't accept") });
  });
});
