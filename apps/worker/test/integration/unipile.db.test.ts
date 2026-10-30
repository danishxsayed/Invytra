/** Accounts connected through Unipile run their actions through its API (only with TEST_DATABASE_URL). */
import { PrismaClient, UnipileClient } from "@invytra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountLock } from "../../src/browser/account-lock.js";
import type { SessionManagerDeps } from "../../src/browser/session-manager.js";
import { memoryPacingStore } from "../../src/queue/pacing.js";
import { processAction } from "../../src/queue/processor.js";
import { FakeRedis } from "../fake-redis.js";
import { FakeUnipile } from "../fake-unipile.js";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("Unipile accounts", () => {
  let prisma: PrismaClient;
  const WS = "ws-uni";
  const ACC = "acc-uni";
  const fake = new FakeUnipile();
  const client = new UnipileClient("api.test:1", "test-key", fake.fetch as typeof fetch);
  const lock = new AccountLock(new FakeRedis());
  const stopped: string[] = [];
  const session = {
    lock,
    accounts: {
      get: async () => null, // never used: no browser for these accounts
      markNeedsAttention: async (id: string, reason: string) => {
        stopped.push(reason);
        await prisma.linkedinAccount.update({ where: { id }, data: { status: "NEEDS_ATTENTION", statusReason: reason } });
      },
      touch: async () => undefined,
    },
  } as unknown as SessionManagerDeps;
  let n = 0;

  /** Queue one action and run it through the normal processor. */
  async function run(type: string, targetUrl: string | null, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    const id = `uni-a${++n}`;
    await prisma.action.create({ data: { id, accountId: ACC, type: type as never, status: "QUEUED", targetUrl, payload: payload as never, scheduledAt: new Date(Date.now() - 1000), ...extra } });
    const r = await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client }, id);
    return { r, row: await prisma.action.findUniqueOrThrow({ where: { id } }) };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.workspace.create({ data: { id: WS, name: "Uni" } });
    await prisma.linkedinAccount.create({
      data: { id: ACC, workspaceId: WS, label: "uni", proxyUrl: "", workingHours: {}, limits: {}, status: "ACTIVE", engine: "UNIPILE", unipileAccountId: "uni-1", premiumCheckedAt: new Date() },
    });
    fake.add({ slug: "jane-doe", providerId: "P-JANE", first: "Jane", last: "Doe", headline: "Founder at Acme", distance: "SECOND_DEGREE", posts: ["111"] });
    fake.add({ slug: "raj-k", providerId: "P-RAJ", first: "Raj", last: "Kumar", distance: "FIRST_DEGREE", premium: true, posts: ["222"] });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("visits a profile (they're notified) and records who they are", async () => {
    const { row } = await run("PROFILE_VISIT", "https://www.linkedin.com/in/jane-doe/");
    expect(row.status).toBe("SUCCEEDED");
    expect(fake.visits).toEqual(["jane-doe"]);
    expect((row.payload as { result: Record<string, unknown> }).result).toMatchObject({ name: "Jane Doe", status: "NOT_CONNECTED", degree: 2, premium: false });
  });

  it("sends a connection request with the note filled in, and skips a second one", async () => {
    const { row } = await run("CONNECTION_REQUEST", "https://www.linkedin.com/in/jane-doe/", { note: "Hi {firstName}, saw {company}.", vars: { company: "Acme" } });
    expect(row.status).toBe("SUCCEEDED");
    expect(fake.invites).toEqual([{ id: expect.any(String), providerId: "P-JANE", message: "Hi Jane, saw Acme." }]);
    const again = await run("CONNECTION_REQUEST", "https://www.linkedin.com/in/jane-doe/", { note: "Hi {firstName}" });
    expect(again.row).toMatchObject({ status: "SKIPPED", error: "PENDING" });
  });

  it("sends without the note when LinkedIn refuses notes, and asks to pause notes", async () => {
    fake.add({ slug: "ana-b", providerId: "P-ANA", first: "Ana", last: "B", distance: "THIRD_DEGREE" });
    fake.rejectNotes = true;
    const { row } = await run("CONNECTION_REQUEST", "https://www.linkedin.com/in/ana-b/", { note: "Hi {firstName}" });
    fake.rejectNotes = false;
    expect(row.status).toBe("SUCCEEDED");
    expect(fake.invites.find((i) => i.providerId === "P-ANA")?.message).toBeUndefined();
    expect((row.payload as { result: Record<string, unknown> }).result).toMatchObject({ withNote: false, noteLimitHit: true });
  });

  it("withdraws a pending invite", async () => {
    const { row } = await run("WITHDRAW_INVITE", "https://www.linkedin.com/in/ana-b/");
    expect(row.status).toBe("SUCCEEDED");
    expect(fake.invites.some((i) => i.providerId === "P-ANA")).toBe(false);
  });

  it("messages connections only, and respects the campaign's audience", async () => {
    const notConnected = await run("MESSAGE", "https://www.linkedin.com/in/jane-doe/", { text: "Hello {firstName}" });
    expect(notConnected.row).toMatchObject({ status: "SKIPPED", error: "NOT_CONNECTED (PENDING)" });
    const outside = await run("MESSAGE", "https://www.linkedin.com/in/raj-k/", { text: "Hello", audience: { degrees: [2, 3], premiumOnly: false } });
    expect(outside.row).toMatchObject({ status: "SKIPPED", error: "AUDIENCE:DEGREE_1" });
    const ok = await run("MESSAGE", "https://www.linkedin.com/in/raj-k/", { text: "Hello {firstName}" });
    expect(ok.row.status).toBe("SUCCEEDED");
    expect(fake.chats[0]!.messages.at(-1)!.text).toBe("Hello Raj");
  });

  it("likes and comments on the latest post", async () => {
    expect((await run("LIKE_POST", "https://www.linkedin.com/in/raj-k/")).row.status).toBe("SUCCEEDED");
    const c = await run("COMMENT_POST", "https://www.linkedin.com/in/raj-k/", { text: "Great point, {firstName}!" });
    expect(c.row.status).toBe("SUCCEEDED");
    expect(fake.reactions).toContain("urn:li:activity:222");
    expect(fake.comments).toEqual([{ post: "urn:li:activity:222", text: "Great point, Raj!" }]);
  });

  it("skips follow and event invites (not available through Unipile)", async () => {
    expect((await run("FOLLOW_PROFILE", "https://www.linkedin.com/in/raj-k/")).row).toMatchObject({ status: "SKIPPED", error: "NOT_AVAILABLE_UNIPILE" });
    const ev = await run("EVENT_INVITE", "https://www.linkedin.com/in/raj-k/", { eventUrl: "https://www.linkedin.com/events/123456/", name: "Raj Kumar" });
    expect(ev.row).toMatchObject({ status: "SKIPPED", error: "NOT_AVAILABLE_UNIPILE" });
  });

  it("reads people from a search", async () => {
    const { row } = await run("SEARCH_PAGE", "https://www.linkedin.com/search/results/people/?keywords=founder", { kind: "LINKEDIN_SEARCH", page: 1 });
    const result = (row.payload as { result: { people: { profileUrl: string; firstName: string; company: string | null }[]; hasNext: boolean } }).result;
    expect(result.people.map((p) => p.profileUrl)).toContain("https://www.linkedin.com/in/jane-doe/");
    expect(result.people.find((p) => p.firstName === "Jane")?.company).toBe("Acme");
    expect(result.hasNext).toBe(false);
  });

  it("stores replies from the inbox with the chat id, and answers in that chat", async () => {
    fake.receive("raj-k", "Sounds good, let's talk");
    fake.ads.push({ id: "AD-1", subject: "What have you built lately?" });
    // An ad stored by an earlier version is removed.
    await prisma.conversation.create({ data: { accountId: ACC, participantName: "What have you built lately?", externalId: "AD-1" } });
    const sync = await run("INBOX_SYNC", null);
    expect(await prisma.conversation.count({ where: { accountId: ACC, externalId: "AD-1" } })).toBe(0);
    expect(sync.row.status).toBe("SUCCEEDED");
    const conv = await prisma.conversation.findFirstOrThrow({ where: { accountId: ACC, participantName: "Raj Kumar" }, include: { messages: true } });
    expect(conv.externalId).toBe(fake.chats[0]!.id);
    expect(conv.lastFromMe).toBe(false);
    expect(conv.messages.map((m) => m.text)).toEqual(["Hello Raj", "Sounds good, let's talk"]);

    // Nothing changed: the next check doesn't read the chat again.
    const reads = () => fake.calls.filter((c) => /\/chats\/[^/]+\/messages$/.test(c) && c.startsWith("GET")).length;
    const before = reads();
    expect((await run("INBOX_SYNC", null)).row.status).toBe("SUCCEEDED");
    expect(reads()).toBe(before);

    const reply = await run("REPLY", null, { name: "Raj Kumar", text: "Great, Tuesday?" }, { conversationId: conv.id });
    expect(reply.row.status).toBe("SUCCEEDED");
    expect(fake.chats[0]!.messages.at(-1)).toMatchObject({ text: "Great, Tuesday?", mine: true });
  });

  it("stops the account when Unipile says it was logged out", async () => {
    fake.disconnected = true;
    const { r, row } = await run("PROFILE_VISIT", "https://www.linkedin.com/in/jane-doe/");
    fake.disconnected = false;
    expect(row.status).toBe("FAILED");
    expect(r).toMatchObject({ kind: "done", status: "FAILED" });
    expect(stopped).toEqual(["LOGGED_OUT"]);
    expect((await prisma.linkedinAccount.findUniqueOrThrow({ where: { id: ACC } })).status).toBe("NEEDS_ATTENTION");
  });
});
