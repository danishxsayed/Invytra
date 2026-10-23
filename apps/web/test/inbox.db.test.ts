/** Inbox, activity and weekly table against a real database (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityCount, recentActivity, weekTable } from "../src/lib/data";
import { inboxPage, inboxTabCounts, needsReplyCount, setDone } from "../src/lib/inbox";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("inbox and activity", () => {
  let prisma: PrismaClient;
  const A = "ws-inb-a";
  const B = "ws-inb-b";
  const now = new Date("2026-10-23T10:00:00Z");
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "acc-inb-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "acc-inb-b", workspaceId: B, label: "b", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
      ],
    });
    await prisma.campaign.create({ data: { id: "camp-inb", workspaceId: A, name: "Founders", accountId: "acc-inb-a", status: "ACTIVE", steps: [] } });
    await prisma.campaignLead.create({
      data: { id: "cl-inb", campaignId: "camp-inb", workspaceId: A, profileUrl: "https://www.linkedin.com/in/jane/", company: "Acme", state: "REPLIED", connectedAt: now },
    });
    await prisma.inboxMessage.createMany({
      data: [
        { id: "m1", accountId: "acc-inb-a", linkedinMessageId: "1", fromName: "Jane Doe", text: "Sounds good", sentAt: now, fetchedAt: now, campaignLeadId: "cl-inb" },
        { id: "m2", accountId: "acc-inb-a", linkedinMessageId: "2", fromName: "Sam Lee", text: "Who is this?", sentAt: now, fetchedAt: now },
        { id: "m3", accountId: "acc-inb-a", linkedinMessageId: "3", fromName: "Old Pal", text: "ok", sentAt: now, fetchedAt: now, answeredAt: now },
        { id: "m4", accountId: "acc-inb-b", linkedinMessageId: "4", fromName: "Other", text: "B's reply", sentAt: now, fetchedAt: now },
      ],
    });
    await prisma.action.createMany({
      data: [
        { accountId: "acc-inb-a", type: "CONNECTION_REQUEST", status: "SUCCEEDED", executedAt: now, campaignLeadId: "cl-inb", targetUrl: "https://www.linkedin.com/in/jane/" },
        { accountId: "acc-inb-a", type: "PROFILE_VISIT", status: "FAILED", executedAt: now, error: "Timeout", screenshotPath: "/x/page.png" },
        { accountId: "acc-inb-b", type: "MESSAGE", status: "SUCCEEDED", executedAt: now },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("shows replies that need an answer, linked to their campaign", async () => {
    const { total, rows } = await inboxPage(prisma, A);
    expect(total).toBe(2);
    expect(rows.find((r) => r.id === "m1")!.campaignLead).toMatchObject({ company: "Acme", campaign: { name: "Founders" } });
    expect(await inboxTabCounts(prisma, A, {})).toEqual({ needs_reply: 2, all: 3, done: 1 });
    expect((await inboxPage(prisma, A, { campaignId: "camp-inb", tab: "all" })).rows.map((r) => r.id)).toEqual(["m1"]);
    expect((await inboxPage(prisma, A, { q: "who is", tab: "all" })).rows.map((r) => r.id)).toEqual(["m2"]);
    expect(await needsReplyCount(prisma, A)).toBe(2);
  });

  it("marks done and back, only within the workspace", async () => {
    expect(await setDone(prisma, B, ["m1", "m2"], true)).toEqual({ ok: true, value: 0 });
    expect(await setDone(prisma, A, ["m2", "m4"], true)).toEqual({ ok: true, value: 1 });
    expect(await needsReplyCount(prisma, A)).toBe(1);
    expect(await needsReplyCount(prisma, B)).toBe(1);
    await setDone(prisma, A, ["m2"], false);
    expect(await needsReplyCount(prisma, A)).toBe(2);
  });

  it("never shows another workspace's replies or actions", async () => {
    expect((await inboxPage(prisma, B, { tab: "all" })).rows.map((r) => r.id)).toEqual(["m4"]);
    expect((await inboxPage(prisma, B, { accountId: "acc-inb-a", tab: "all" })).total).toBe(0);
    expect((await inboxPage(prisma, B, { campaignId: "camp-inb", tab: "all" })).total).toBe(0);
    expect(await activityCount(prisma, B, { accountId: "acc-inb-a" })).toBe(0);
    expect(await activityCount(prisma, B)).toBe(1);
  });

  it("filters activity by type, result and campaign", async () => {
    expect(await activityCount(prisma, A)).toBe(2);
    expect(await activityCount(prisma, A, { status: "FAILED" })).toBe(1);
    expect(await activityCount(prisma, A, { type: "CONNECTION_REQUEST" })).toBe(1);
    const camp = await recentActivity(prisma, A, { campaignId: "camp-inb" });
    expect(camp.map((r) => r.campaignLead?.campaign.name)).toEqual(["Founders"]);
  });

  it("builds the weekly table by day in the account's time zone", async () => {
    const t = await weekTable(prisma, A, "Asia/Kolkata", new Date("2026-10-23T12:00:00Z"));
    expect(t.days.at(-1)!.key).toBe("2026-10-23");
    const by = Object.fromEntries(t.rows.map((r) => [r.label, r.counts.at(-1)]));
    expect(by).toEqual({ "Profile visits": 0, "Invites sent": 1, Accepted: 1, "Messages sent": 0, Replies: 3 });
  });
});
