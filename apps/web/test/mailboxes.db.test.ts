/** Email Outreach mailboxes (only with TEST_DATABASE_URL). */
import { PrismaClient, openSecret, type DnsLookup, type MailboxTester } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMailbox, listMailboxes, recheckMailbox, removeMailbox, type ConnectMailboxInput } from "../src/lib/mailboxes";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const works: MailboxTester = { smtp: async () => undefined, imap: async () => undefined };
const badPassword: MailboxTester = {
  smtp: async () => {
    throw Object.assign(new Error("535 Authentication failed"), { code: "EAUTH" });
  },
  imap: async () => undefined,
};
/** getcrawlers.com has SPF and MX for Google, but no DKIM or DMARC yet. */
const dns: DnsLookup = {
  txt: async (n) => (n === "getcrawlers.com" ? ["v=spf1 include:_spf.google.com ~all"] : []),
  mx: async () => ["smtp.google.com"],
};
const input = (email: string): ConnectMailboxInput => ({
  provider: "GOOGLE",
  email,
  fromName: "Tahur Sayed",
  password: "app-pass-1234",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  imapHost: "imap.gmail.com",
  imapPort: 993,
});

d("Email Outreach mailboxes", () => {
  let prisma: PrismaClient;
  const WS = "ws-mail";
  const OTHER = "ws-mail-2";

  beforeAll(async () => {
    process.env.SESSION_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.ALLOW_PRIVATE_MAIL_HOSTS = "true"; // no DNS in tests
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "Mail" }, { id: OTHER, name: "Someone else" }] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    delete process.env.ALLOW_PRIVATE_MAIL_HOSTS;
    await prisma.$disconnect();
  });

  it("saves a mailbox only when it can send and read, with the password encrypted", async () => {
    const bad = await connectMailbox(prisma, WS, input("tahur@getcrawlers.com"), { tester: badPassword, dns });
    expect(bad).toMatchObject({ ok: true, value: { smtp: { ok: false }, imap: { ok: true } } });
    expect((bad as { value: { id?: string } }).value.id).toBeUndefined();
    expect(await prisma.emailAccount.count({ where: { workspaceId: WS } })).toBe(0);

    const ok = await connectMailbox(prisma, WS, input("Tahur@GetCrawlers.com".toLowerCase()), { tester: works, dns });
    expect(ok).toMatchObject({ ok: true, value: { smtp: { ok: true }, imap: { ok: true }, id: expect.any(String) } });
    const row = await prisma.emailAccount.findFirstOrThrow({ where: { workspaceId: WS } });
    expect(row.secret).not.toContain("app-pass-1234");
    expect(openSecret(row.secret, process.env.SESSION_ENCRYPTION_KEY!)).toBe("app-pass-1234");
    expect(row.username).toBe("tahur@getcrawlers.com");
    // The list never includes the password.
    const [listed] = await listMailboxes(prisma, WS);
    expect(Object.keys(listed!)).not.toContain("secret");
    // The domain's DNS was checked and saved with it.
    expect(listed!.dns).toMatchObject({ domain: "getcrawlers.com", spf: { status: "ok" }, mx: { status: "ok" }, dkim: { status: "missing" }, dmarc: { status: "missing" } });
  });

  it("connects a mailbox once on Invytra (named only inside your workspace)", async () => {
    expect(await connectMailbox(prisma, WS, input("tahur@getcrawlers.com"), { tester: works, dns })).toEqual({ ok: false, error: "This mailbox is already connected here." });
    expect(await connectMailbox(prisma, OTHER, input("tahur@getcrawlers.com"), { tester: works, dns })).toEqual({ ok: false, error: "This mailbox is already on Invytra under a different user." });
  });

  it("marks a mailbox that stopped working, and only its own workspace can touch it", async () => {
    const m = await prisma.emailAccount.findFirstOrThrow({ where: { workspaceId: WS } });
    expect(await recheckMailbox(prisma, OTHER, m.id, { tester: works, dns })).toEqual({ ok: false, error: "Mailbox not found." });
    await recheckMailbox(prisma, WS, m.id, { tester: badPassword, dns });
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: "ERROR", statusReason: expect.stringMatching(/didn't accept/) });
    await recheckMailbox(prisma, WS, m.id, { tester: works, dns });
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: "ACTIVE", statusReason: null });
    expect(await removeMailbox(prisma, OTHER, m.id)).toMatchObject({ ok: false });
    expect(await removeMailbox(prisma, WS, m.id)).toEqual({ ok: true, value: undefined });
  });
});
