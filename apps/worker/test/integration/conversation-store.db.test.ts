/** Conversations from inbox checks (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordReply, storeConversations } from "../../src/actions/conversation-store.js";
import type { InboxThread } from "../../src/linkedin/inbox.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const now = new Date("2026-10-26T08:30:00Z"); // Mon 14:00 IST
const thread = (name: string, snippet: string, extra: Partial<InboxThread> = {}): InboxThread => ({
  threadId: name, name, snippet, timeText: "", unread: false, messageKey: `${name}:${snippet}`, ...extra,
});

d("conversation store", () => {
  let prisma: PrismaClient;
  const WS = "ws-conv";
  const conv = (name: string) => prisma.conversation.findUniqueOrThrow({ where: { accountId_participantName: { accountId: "acc-cv", participantName: name } }, include: { messages: { orderBy: { sentAt: "asc" } } } });
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Conv" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-cv", workspaceId: WS, label: "cv", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE", timezone: "Asia/Kolkata" } });
    await prisma.campaign.create({ data: { id: "camp-cv", workspaceId: WS, name: "C", status: "ACTIVE", steps: [], senders: { create: { accountId: "acc-cv" } } } });
    await prisma.campaignLead.create({ data: { id: "cl-tilak", campaignId: "camp-cv", accountId: "acc-cv", workspaceId: WS, profileUrl: "https://www.linkedin.com/in/tilak/", firstName: "Tilak", lastName: "Patel", state: "DONE" } });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("stores a snippet-only conversation, linked to the campaign lead by name", async () => {
    expect(await storeConversations(prisma, "acc-cv", [thread("Tilak Patel", "Tilak: I'm happy to connect", { unread: true })], "Asia/Kolkata", now)).toBe(1);
    expect(await conv("Tilak Patel")).toMatchObject({
      campaignLeadId: "cl-tilak", lastFromMe: false, lastMessageText: "I'm happy to connect", unread: true,
      messages: [{ fromMe: false, text: "I'm happy to connect" }],
    });
  });

  it("fills in the whole chat when it's read, without duplicating what it already had", async () => {
    await storeConversations(prisma, "acc-cv", [
      thread("Tilak Patel", "Tilak: I'm happy to connect", {
        messageKey: "k2",
        messages: [
          { fromMe: true, text: "Hi Tilak, I am reaching out to connect.", dateLabel: "OCT 18", timeLabel: "12:14 PM" },
          { fromMe: false, text: "I'm happy to connect", dateLabel: "OCT 18", timeLabel: "12:15 PM" },
        ],
      }),
    ], "Asia/Kolkata", now);
    const c = await conv("Tilak Patel");
    expect(c.messages.map((m) => [m.fromMe, m.text, m.timeLabel])).toEqual([
      [true, "Hi Tilak, I am reaching out to connect.", "OCT 18 · 12:14 PM"],
      [false, "I'm happy to connect", "OCT 18 · 12:15 PM"],
    ]);
    expect(c.lastMessageAt).toEqual(new Date("2026-10-18T06:45:00.000Z"));
  });

  it("shows a reply sent from Invytra, then the same message read back from LinkedIn only once", async () => {
    const c = await conv("Tilak Patel");
    await prisma.conversation.update({ where: { id: c.id }, data: { doneAt: now } });
    await recordReply(prisma, c.id, "Great! Free on Tuesday?", now);
    expect(await conv("Tilak Patel")).toMatchObject({ lastFromMe: true, lastMessageText: "Great! Free on Tuesday?" });
    await storeConversations(prisma, "acc-cv", [thread("Tilak Patel", "You: Great! Free on Tuesday?", { messageKey: "k3", messages: [
      { fromMe: true, text: "Hi Tilak, I am reaching out to connect.", dateLabel: "OCT 18", timeLabel: "12:14 PM" },
      { fromMe: false, text: "I'm happy to connect", dateLabel: "OCT 18", timeLabel: "12:15 PM" },
      { fromMe: true, text: "Great!  Free on Tuesday?", dateLabel: "TODAY", timeLabel: "1:58 PM" },
    ] })], "Asia/Kolkata", now);
    expect((await conv("Tilak Patel")).messages).toHaveLength(3);
  });

  it("brings a done conversation back when they write again", async () => {
    await storeConversations(prisma, "acc-cv", [thread("Tilak Patel", "Tilak: Yes, 11 AM works", { messageKey: "k4" })], "Asia/Kolkata", now);
    expect(await conv("Tilak Patel")).toMatchObject({ doneAt: null, lastFromMe: false, lastMessageText: "Yes, 11 AM works" });
  });
});
