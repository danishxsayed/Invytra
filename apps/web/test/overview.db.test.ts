/**
 * The workspace overview against a real database (only with TEST_DATABASE_URL — it is wiped):
 * this week's numbers across channels, and what needs attention.
 */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "../src/lib/auth";
import { setTags } from "../src/lib/inbox";
import { needsAttention, numbersBetween, replyRate, weekNumbers } from "../src/lib/overview";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const DAY = 86_400_000;

d("overview", () => {
  let prisma: PrismaClient;
  const WS = "ws-ov";
  const now = new Date("2026-11-08T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const me = (role: "OWNER" | "MEMBER") => ({ user: { id: "u", name: "T", email: "t@x.co" }, workspace: { id: WS, name: "Ov", plan: "trial", channels: ["linkedin", "email"] }, role }) as unknown as CurrentUser;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Ov", plan: "trial", createdAt: ago(5), channels: ["linkedin", "email"], aiExtra: 0, aiMonthly: 50, aiUsed: 45, aiPeriod: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "ov-a1", workspaceId: WS, label: "Main", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "ov-a2", workspaceId: WS, label: "Second", proxyUrl: "", workingHours: {}, limits: {}, status: "DISCONNECTED" },
      ],
    });
    const act = (url: string, type: "CONNECTION_REQUEST" | "MESSAGE" | "PROFILE_VISIT", when: Date, status: "SUCCEEDED" | "FAILED" = "SUCCEEDED") => ({ accountId: "ov-a1", type, status, targetUrl: url, scheduledAt: when, executedAt: when });
    await prisma.action.createMany({
      data: [
        act("https://www.linkedin.com/in/a/", "CONNECTION_REQUEST", ago(2)),
        act("https://www.linkedin.com/in/a/", "MESSAGE", ago(1)), // same person: counted once
        act("https://www.linkedin.com/in/b/", "MESSAGE", ago(3)),
        act("https://www.linkedin.com/in/c/", "PROFILE_VISIT", ago(1)), // a visit isn't contact
        act("https://www.linkedin.com/in/d/", "CONNECTION_REQUEST", ago(1), "FAILED"),
        act("https://www.linkedin.com/in/e/", "CONNECTION_REQUEST", ago(10)), // last week
      ],
    });
    await prisma.conversation.create({ data: { id: "ov-c1", accountId: "ov-a1", participantName: "A", lastFromMe: false, messages: { create: [{ fromMe: false, text: "Hi!", sentAt: ago(1), key: "1" }, { fromMe: false, text: "Also", sentAt: ago(1), key: "2" }] } } });
    await prisma.emailAccount.create({ data: { id: "ov-m1", workspaceId: WS, email: "me@ov.co", fromName: "T", provider: "OTHER", smtpHost: "s", smtpPort: 465, smtpSecure: true, imapHost: "i", imapPort: 993, username: "me@ov.co", secret: "x", status: "ERROR", statusReason: "Login refused" } });
    await prisma.emailSend.createMany({
      data: [
        { workspaceId: WS, emailAccountId: "ov-m1", kind: "CAMPAIGN", status: "SENT", toEmail: "x@y.co", subject: "s", createdAt: ago(2) },
        { workspaceId: WS, emailAccountId: "ov-m1", kind: "CAMPAIGN", status: "SENT", toEmail: "x@y.co", subject: "s", createdAt: ago(1) },
        { workspaceId: WS, emailAccountId: "ov-m1", kind: "WARMUP", status: "SENT", toEmail: "w@y.co", subject: "s", createdAt: ago(1) },
      ],
    });
    await prisma.emailReply.createMany({
      data: [
        { workspaceId: WS, emailAccountId: "ov-m1", kind: "REPLY", fromEmail: "x@y.co", subject: "Re", text: "Yes", receivedAt: ago(1) },
        { workspaceId: WS, emailAccountId: "ov-m1", kind: "AUTO_REPLY", fromEmail: "z@y.co", subject: "OOO", text: "Away", receivedAt: ago(1) },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("counts people contacted, replies and meetings this week, per channel", async () => {
    const r = await setTags(prisma, WS, "ov-c1", ["Interested", "Meeting booked"]);
    expect(r.ok).toBe(true);
    const { week, before } = await weekNumbers(prisma, WS, now);
    expect(week.contacted).toBe(3);
    const w = await numbersBetween(prisma, WS, ago(7), now);
    expect(w.byChannel).toEqual({ linkedin: { contacted: 2, replies: 1 }, email: { contacted: 1, replies: 1 } });
    expect(w).toMatchObject({ contacted: 3, replies: 2 });
    expect(replyRate(w)).toBe(66.7);
    expect((await numbersBetween(prisma, WS, ago(14), ago(7))).contacted).toBe(1);
    expect(replyRate({ contacted: 0, replies: 0 })).toBeNull();
    expect(before.meetings).toBe(0);
    // The meeting counts from when it was tagged; removing the tag uncounts it.
    expect((await numbersBetween(prisma, WS, new Date(Date.now() - 60_000), new Date(Date.now() + 60_000))).meetings).toBe(1);
    await setTags(prisma, WS, "ov-c1", ["Interested"]);
    expect((await numbersBetween(prisma, WS, new Date(Date.now() - 60_000), new Date(Date.now() + 60_000))).meetings).toBe(0);
  });

  it("lists what needs attention, with fixes; billing fixes only for the owner", async () => {
    const items = await needsAttention(prisma, me("OWNER"), now);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["li-ov-a2", "mb-ov-m1", "ai", "li-replies", "em-replies"]));
    // The trial's days left are in the plan banner now, not in this list.
    expect(ids).not.toContain("trial");
    expect(items.find((i) => i.id === "li-ov-a2")).toMatchObject({ tone: "urgent", action: { label: "Reconnect", href: expect.stringContaining("/app/accounts/ov-a2") } });
    expect(items.find((i) => i.id === "mb-ov-m1")).toMatchObject({ detail: "Login refused" });
    const member = await needsAttention(prisma, me("MEMBER"), now);
    expect(member.find((i) => i.id === "ai")!.action).toBeNull();
    expect(member.find((i) => i.id === "li-ov-a2")!.action).not.toBeNull();
  });
});
