/** Email warm-up settings and progress (only with TEST_DATABASE_URL). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sentToday } from "../src/lib/mailbox-sending";
import { saveWarmupSettings, warmupOverview } from "../src/lib/warmup";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("Email warm-up settings", () => {
  let prisma: PrismaClient;
  const WS = "ws-wu";
  const OTHER = "ws-wu-2";
  const now = new Date("2026-11-16T05:30:00Z");
  const mk = (id: string, workspaceId: string, email: string) =>
    prisma.emailAccount.create({
      data: { id, workspaceId, email, fromName: id, provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: email, secret: "x", timeZone: "Asia/Kolkata" },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.emailAccount.updateMany({ where: { warmupEnabled: true }, data: { warmupEnabled: false } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.workspace.createMany({ data: [{ id: WS, name: "W" }, { id: OTHER, name: "O" }] });
    await mk("wu-a", WS, "a@wu-a.pro");
    await mk("wu-b", OTHER, "b@wu-b.pro");
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [WS, OTHER] } } });
    await prisma.$disconnect();
  });

  it("turns warm-up on (ramp from today), only for its own workspace, and waits for a partner", async () => {
    expect(await saveWarmupSettings(prisma, OTHER, "wu-a", { enabled: true, maxDaily: 20, replyRate: 30 })).toMatchObject({ ok: false });
    const started = new Date("2026-11-01T04:00:00Z");
    await saveWarmupSettings(prisma, WS, "wu-a", { enabled: true, maxDaily: 20, replyRate: 25 }, started);
    expect(await prisma.emailAccount.findUniqueOrThrow({ where: { id: "wu-a" } })).toMatchObject({ warmupEnabled: true, warmupStartedAt: started, warmupReplyRate: 25 });
    // Saving again while on keeps the ramp's start.
    await saveWarmupSettings(prisma, WS, "wu-a", { enabled: true, maxDaily: 30, replyRate: 25 }, now);
    expect((await prisma.emailAccount.findUniqueOrThrow({ where: { id: "wu-a" } })).warmupStartedAt).toEqual(started);
    const [alone] = await warmupOverview(prisma, WS, now);
    expect(alone).toMatchObject({ stage: "NO_PARTNER", day: 16, target: 30 });
  });

  it("scores the inbox rate from where its warm-up emails landed, and keeps them off the campaign limit", async () => {
    await saveWarmupSettings(prisma, OTHER, "wu-b", { enabled: true, maxDaily: 20, replyRate: 30 }, now);
    const send = (landedIn: "INBOX" | "SPAM" | null, o: object = {}) =>
      prisma.emailSend.create({ data: { workspaceId: WS, emailAccountId: "wu-a", toAccountId: "wu-b", kind: "WARMUP", status: "SENT", toEmail: "b@wu-b.pro", subject: "x", landedIn, createdAt: now, ...o } });
    for (let i = 0; i < 9; i++) await send("INBOX");
    await send("SPAM");
    await prisma.emailSend.create({ data: { workspaceId: OTHER, emailAccountId: "wu-b", toAccountId: "wu-a", kind: "WARMUP", status: "SENT", toEmail: "a@wu-a.pro", subject: "Re: x", isReply: true, createdAt: now } });
    const [r] = await warmupOverview(prisma, WS, now);
    expect(r).toMatchObject({ stage: "READY", rate: 90, last7: { inbox: 9, spam: 1, missing: 0 }, sentToday: 10, received: 1, replies: 1 });
    // The other workspace's mailbox isn't listed here.
    expect((await warmupOverview(prisma, WS, now)).map((x) => x.id)).toEqual(["wu-a"]);
    expect((await sentToday(prisma, [{ id: "wu-a", timeZone: "Asia/Kolkata" }], now)).get("wu-a")).toBe(0);
  });

  it("restarts the ramp when turned off and on again", async () => {
    await saveWarmupSettings(prisma, WS, "wu-a", { enabled: false, maxDaily: 30, replyRate: 25 }, now);
    expect((await warmupOverview(prisma, WS, now))[0]).toMatchObject({ stage: "OFF", day: null });
    await saveWarmupSettings(prisma, WS, "wu-a", { enabled: true, maxDaily: 30, replyRate: 25 }, now);
    expect((await warmupOverview(prisma, WS, now))[0]).toMatchObject({ day: 1, target: 2 });
  });
});
