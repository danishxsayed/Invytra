/** Inbox, activity and weekly table against a real database (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityCount, recentActivity, weekTable } from "../src/lib/data";
import { conversationList, getConversation, inboxCounts, needsReplyCount, setDone, setLeadPaused, setTags } from "../src/lib/inbox";

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
    await prisma.campaign.create({ data: { id: "camp-inb", workspaceId: A, name: "Founders", senders: { create: { accountId: "acc-inb-a" } }, status: "ACTIVE", steps: [] } });
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
    await prisma.conversation.createMany({
      data: [
        { id: "c1", accountId: "acc-inb-a", participantName: "Jane Doe", campaignLeadId: "cl-inb", lastMessageText: "Sounds good", lastMessageAt: now },
        { id: "c2", accountId: "acc-inb-a", participantName: "Sam Lee", lastMessageText: "Who is this?", lastMessageAt: new Date(now.getTime() - 1000), unread: true },
        { id: "c3", accountId: "acc-inb-a", participantName: "Old Pal", lastMessageText: "ok thanks", lastFromMe: true, lastMessageAt: new Date(now.getTime() - 2000) },
        { id: "c4", accountId: "acc-inb-b", participantName: "Other", lastMessageText: "B's reply", lastMessageAt: now },
      ],
    });
    await prisma.conversationMessage.createMany({
      data: [
        { conversationId: "c1", fromMe: true, text: "Hi Jane", sentAt: new Date(now.getTime() - 60_000), key: "a" },
        { conversationId: "c1", fromMe: false, text: "Sounds good", sentAt: now, key: "b" },
        { conversationId: "c2", fromMe: false, text: "Who is this?", sentAt: now, key: "c" },
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

  it("lists conversations that need an answer, linked to their campaign", async () => {
    const { total, rows } = await conversationList(prisma, A);
    expect(total).toBe(2);
    expect(rows.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(rows[0]!.campaignLead).toMatchObject({ company: "Acme", campaign: { name: "Founders" } });
    expect(await inboxCounts(prisma, A, {})).toEqual({ needs_reply: 2, unread: 1, replied: 2, all: 3, done: 1 });
    expect((await conversationList(prisma, A, { campaignId: "camp-inb", filter: "all" })).rows.map((r) => r.id)).toEqual(["c1"]);
    expect((await conversationList(prisma, A, { q: "who is", filter: "all" })).rows.map((r) => r.id)).toEqual(["c2"]);
    expect(await needsReplyCount(prisma, A)).toBe(2);
  });

  it("opens a conversation with its messages in order", async () => {
    const c = await getConversation(prisma, A, "c1");
    expect(c!.messages.map((m) => [m.fromMe, m.text])).toEqual([[true, "Hi Jane"], [false, "Sounds good"]]);
    expect(await getConversation(prisma, B, "c1")).toBeNull();
  });

  it("marks done and back, only within the workspace", async () => {
    expect(await setDone(prisma, B, ["c1", "c2"], true)).toEqual({ ok: true, value: 0 });
    expect(await setDone(prisma, A, ["c2", "c4"], true)).toEqual({ ok: true, value: 1 });
    expect(await needsReplyCount(prisma, A)).toBe(1);
    expect(await needsReplyCount(prisma, B)).toBe(1);
    await setDone(prisma, A, ["c2"], false);
    expect(await needsReplyCount(prisma, A)).toBe(2);
  });

  it("tags conversations and filters by tag", async () => {
    expect(await setTags(prisma, A, "c1", [" Interested ", "Interested", "Meeting booked"])).toEqual({ ok: true, value: ["Interested", "Meeting booked"] });
    expect(await setTags(prisma, B, "c1", ["x"])).toMatchObject({ ok: false });
    expect(await setTags(prisma, A, "c1", ["x".repeat(31)])).toMatchObject({ ok: false });
    expect((await conversationList(prisma, A, { tag: "Interested", filter: "all" })).rows.map((r) => r.id)).toEqual(["c1"]);
  });

  it("pauses and resumes the campaign for that person", async () => {
    await prisma.campaignLead.update({ where: { id: "cl-inb" }, data: { state: "IN_PROGRESS", step: 1 } });
    const queued = await prisma.action.create({ data: { accountId: "acc-inb-a", type: "MESSAGE", status: "QUEUED", campaignLeadId: "cl-inb" } });
    expect(await setLeadPaused(prisma, B, "c1", true)).toMatchObject({ ok: false });
    expect(await setLeadPaused(prisma, A, "c1", true)).toEqual({ ok: true, value: undefined });
    expect(await prisma.campaignLead.findUnique({ where: { id: "cl-inb" } })).toMatchObject({ state: "PAUSED", reason: "PAUSED:IN_PROGRESS" });
    expect(await prisma.action.findUnique({ where: { id: queued.id } })).toMatchObject({ status: "SKIPPED", error: "CANCELLED" });
    expect(await setLeadPaused(prisma, A, "c1", false)).toEqual({ ok: true, value: undefined });
    expect(await prisma.campaignLead.findUnique({ where: { id: "cl-inb" } })).toMatchObject({ state: "IN_PROGRESS", reason: null });
    expect(await setLeadPaused(prisma, A, "c2", true)).toMatchObject({ ok: false }); // not from a campaign
    await prisma.action.delete({ where: { id: queued.id } });
    await prisma.campaignLead.update({ where: { id: "cl-inb" }, data: { state: "REPLIED" } });
  });

  it("never shows another workspace's conversations or actions", async () => {
    expect((await conversationList(prisma, B, { filter: "all" })).rows.map((r) => r.id)).toEqual(["c4"]);
    expect((await conversationList(prisma, B, { accountId: "acc-inb-a", filter: "all" })).total).toBe(0);
    expect((await conversationList(prisma, B, { campaignId: "camp-inb", filter: "all" })).total).toBe(0);
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
