/** Inbox storage against a real database (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeInboxThreads } from "../../src/actions/inbox-store.js";
import type { InboxThread } from "../../src/linkedin/actions.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const thread = (name: string, snippet: string, key = `${name}:${snippet}`): InboxThread => ({
  threadId: name,
  name,
  snippet,
  timeText: "now",
  unread: true,
  messageKey: key,
});

d("inbox storage", () => {
  let prisma: PrismaClient;
  const WS = "ws-inbox";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Inbox" } });
    await prisma.linkedinAccount.create({ data: { id: "acc-in", workspaceId: WS, label: "in", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" } });
    await prisma.campaign.create({ data: { id: "camp-in", workspaceId: WS, name: "C", accountId: "acc-in", status: "ACTIVE", steps: [] } });
    await prisma.campaignLead.create({
      data: { id: "cl-jane", campaignId: "camp-in", workspaceId: WS, profileUrl: "https://www.linkedin.com/in/jane/", linkedinName: "Jane Doe", state: "IN_PROGRESS" },
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("stores replies once, links them to campaign leads by name, and skips our own messages", async () => {
    const t0 = new Date("2026-10-20T06:00:00Z");
    expect(await storeInboxThreads(prisma, "acc-in", [thread("Jane Doe", "Jane: sounds good"), thread("Sam Lee", "Sam: hi"), thread("Al", "You: thanks!")], t0)).toBe(2);
    expect(await storeInboxThreads(prisma, "acc-in", [thread("Jane Doe", "Jane: sounds good")], t0)).toBe(0);
    const rows = await prisma.inboxMessage.findMany({ where: { accountId: "acc-in" }, orderBy: { fromName: "asc" } });
    expect(rows.map((r) => [r.fromName, r.campaignLeadId])).toEqual([
      ["Jane Doe", "cl-jane"],
      ["Sam Lee", null],
    ]);
  });

  it("marks a reply answered once our own message is the latest in that conversation", async () => {
    const t1 = new Date("2026-10-20T07:00:00Z");
    await storeInboxThreads(prisma, "acc-in", [thread("Jane Doe", "You: great, talk Tuesday")], t1);
    const jane = await prisma.inboxMessage.findFirstOrThrow({ where: { fromName: "Jane Doe" } });
    const sam = await prisma.inboxMessage.findFirstOrThrow({ where: { fromName: "Sam Lee" } });
    expect(jane.answeredAt).toEqual(t1);
    expect(sam.answeredAt).toBeNull();
    // She writes again: the new message needs a reply
    const t2 = new Date("2026-10-21T07:00:00Z");
    await storeInboxThreads(prisma, "acc-in", [thread("Jane Doe", "Jane: one more thing")], t2);
    expect((await prisma.inboxMessage.findFirstOrThrow({ where: { text: "Jane: one more thing" } })).answeredAt).toBeNull();
  });
});
