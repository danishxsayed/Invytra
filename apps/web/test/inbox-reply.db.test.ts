/** Replying from the inbox (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelReply, getConversation, requestInboxCheck, sendReply } from "../src/lib/inbox";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("inbox replies", () => {
  let prisma: PrismaClient;
  const A = "ws-rep-a";
  const B = "ws-rep-b";
  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.workspace.createMany({ data: [{ id: A, name: "A" }, { id: B, name: "B" }] });
    await prisma.linkedinAccount.createMany({
      data: [
        { id: "acc-rep-a", workspaceId: A, label: "a", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE" },
        { id: "acc-rep-off", workspaceId: A, label: "off", proxyUrl: "", workingHours: {}, limits: {}, status: "PAUSED" },
      ],
    });
    const now = new Date();
    await prisma.conversation.createMany({
      data: [
        { id: "rm1", accountId: "acc-rep-a", participantName: "Jane Doe", lastMessageText: "Sounds good", lastMessageAt: now },
        { id: "rm2", accountId: "acc-rep-off", participantName: "Sam Lee", lastMessageText: "Hi", lastMessageAt: now },
      ],
    });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  });

  it("queues a reply from that account and shows it with the message", async () => {
    const r = await sendReply(prisma, A, "rm1", "  Great, talk Tuesday!  ");
    expect(r.ok).toBe(true);
    const a = await prisma.action.findUniqueOrThrow({ where: { id: r.ok ? r.value : "" } });
    expect(a).toMatchObject({ type: "REPLY", status: "QUEUED", accountId: "acc-rep-a", conversationId: "rm1", payload: { name: "Jane Doe", text: "Great, talk Tuesday!" } });
    expect((await getConversation(prisma, A, "rm1"))!.replies).toMatchObject([{ status: "QUEUED" }]);
  });

  it("can cancel a reply before it goes, which then disappears", async () => {
    const extra = await prisma.action.create({ data: { accountId: "acc-rep-a", type: "REPLY", status: "QUEUED", conversationId: "rm1", payload: { name: "Jane Doe", text: "oops" } } });
    expect(await cancelReply(prisma, B, extra.id)).toMatchObject({ ok: false });
    expect(await cancelReply(prisma, A, extra.id)).toEqual({ ok: true, value: undefined });
    expect((await getConversation(prisma, A, "rm1"))!.replies.map((r) => r.id)).not.toContain(extra.id);
  });

  it("won't send a second reply while the first is still going", async () => {
    expect(await sendReply(prisma, A, "rm1", "Another")).toMatchObject({ ok: false, error: expect.stringMatching(/still being sent/) });
  });

  it("refuses empty text, placeholders, inactive accounts and other workspaces", async () => {
    await prisma.action.updateMany({ where: { conversationId: "rm1" }, data: { status: "SUCCEEDED" } });
    expect(await sendReply(prisma, A, "rm1", "   ")).toMatchObject({ ok: false });
    expect(await sendReply(prisma, A, "rm1", "Hi {firstName}")).toMatchObject({ ok: false });
    expect(await sendReply(prisma, A, "rm2", "Hello")).toMatchObject({ ok: false, error: expect.stringMatching(/isn't connected and active/) });
    expect(await sendReply(prisma, B, "rm1", "Hello")).toMatchObject({ ok: false, error: expect.stringMatching(/wasn't found/) });
  });

  it("queues an inbox check while the inbox is open, at most every few minutes per connected account", async () => {
    const t0 = new Date();
    expect(await requestInboxCheck(prisma, A, t0)).toMatchObject({ queued: 1 }); // only the active account
    expect(await requestInboxCheck(prisma, A, t0)).toMatchObject({ queued: 0 }); // one is already waiting
    const q = await prisma.action.findFirstOrThrow({ where: { accountId: "acc-rep-a", type: "INBOX_SYNC" } });
    expect(q.payload).toEqual({ onDemand: true });
    await prisma.action.update({ where: { id: q.id }, data: { status: "SUCCEEDED", executedAt: t0 } });
    expect(await requestInboxCheck(prisma, A, new Date(t0.getTime() + 60_000))).toMatchObject({ queued: 0, lastChecked: t0 });
    expect(await requestInboxCheck(prisma, A, new Date(t0.getTime() + 4 * 60_000))).toMatchObject({ queued: 1 });
    expect(await requestInboxCheck(prisma, B, t0)).toMatchObject({ queued: 0 });
  });

  it("brings a routine check that's waiting forward instead of adding another", async () => {
    await prisma.action.deleteMany({ where: { accountId: "acc-rep-a", type: "INBOX_SYNC" } });
    const routine = await prisma.action.create({ data: { accountId: "acc-rep-a", type: "INBOX_SYNC", status: "QUEUED", scheduledAt: new Date(Date.now() + 3600_000) } });
    const t = new Date();
    expect(await requestInboxCheck(prisma, A, t)).toMatchObject({ queued: 0 });
    expect(await prisma.action.findUniqueOrThrow({ where: { id: routine.id } })).toMatchObject({ payload: { onDemand: true }, scheduledAt: t });
  });
});
