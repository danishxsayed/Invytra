/** Replying from the inbox (only with TEST_DATABASE_URL — it is wiped). */
import { PrismaClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getConversation, sendReply } from "../src/lib/inbox";

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
});
