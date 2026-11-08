/** Accounts connected through Unipile run their actions through its API (only with TEST_DATABASE_URL). */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, UnipileClient, VideoError, VoiceError } from "@invytra/db";
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
    fake.add({ slug: "raj-k", providerId: "P-RAJ", first: "Raj", last: "Kumar", distance: "FIRST_DEGREE", premium: true, posts: ["222"], email: " Raj@Example.COM " });
  });
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.$disconnect();
  });

  it("visits a profile (they're notified) and records who they are", async () => {
    const { row } = await run("PROFILE_VISIT", "https://www.linkedin.com/in/jane-doe/");
    expect(row.status).toBe("SUCCEEDED");
    expect(fake.visits).toEqual(["jane-doe"]);
    expect((row.payload as { result: Record<string, unknown> }).result).toMatchObject({ name: "Jane Doe", status: "NOT_CONNECTED", degree: 2, premium: false, photoUrl: "https://media.licdn.com/dms/image/jane-doe.jpg?e=2000000000&t=x" });
  });

  it("reads a connection's email from their contact info (never a non-connection's)", async () => {
    const raj = await run("CHECK_CONNECTION", "https://www.linkedin.com/in/raj-k/");
    expect((raj.row.payload as { result: Record<string, unknown> }).result).toMatchObject({ status: "CONNECTED", email: "raj@example.com" });
    const jane = await run("CHECK_CONNECTION", "https://www.linkedin.com/in/jane-doe/");
    expect((jane.row.payload as { result: Record<string, unknown> }).result).not.toHaveProperty("email");
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
    expect(result.people.find((p) => p.firstName === "Jane")).toMatchObject({ photoUrl: "https://media.licdn.com/dms/image/jane-doe-s.jpg" });
    expect(result.hasNext).toBe(false);
  });

  it("keeps reading a search when LinkedIn leaves the result total empty", async () => {
    fake.searchAnswer = {
      items: Array.from({ length: 10 }, (_, i) => ({ type: "PEOPLE", id: `ACo${i}`, public_identifier: `person-${i}`, name: `Person ${i}`, headline: "Founder at X" })),
      paging: { total_count: null },
    };
    const full = await run("SEARCH_PAGE", "https://www.linkedin.com/search/results/people/?keywords=saas", { kind: "LINKEDIN_SEARCH", page: 1 });
    expect((full.row.payload as { result: { hasNext: boolean } }).result.hasNext).toBe(true);
    // A short last page ends it.
    fake.searchAnswer = { items: [{ type: "PEOPLE", id: "ACoZ", public_identifier: "last-one", name: "Last One" }], paging: { total_count: null } };
    const last = await run("SEARCH_PAGE", "https://www.linkedin.com/search/results/people/?keywords=saas", { kind: "LINKEDIN_SEARCH", page: 2 });
    expect((last.row.payload as { result: { hasNext: boolean } }).result.hasNext).toBe(false);
    fake.searchAnswer = null;
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

  it("writes {aiLine} from their profile once, keeps it for the lead, and falls back or skips", async () => {
    await prisma.linkedinAccount.update({ where: { id: ACC }, data: { status: "ACTIVE", statusReason: null } }); // the test before logged it out
    const asked: number[] = [];
    const ai = {
      write: async (ctx: { name: string; hiring: string[] }, _s: unknown, max: number) => {
        asked.push(max);
        return ctx.name === "Mia Ray" ? { line: null, signal: null } : { line: `Saw you're hiring, ${ctx.name.split(" ")[0]}.`, signal: "hiring" };
      },
    };
    fake.add({ slug: "zoe-t", providerId: "P-ZOE", first: "Zoe", last: "Tan", distance: "SECOND_DEGREE", posts: ["333"] });
    fake.add({ slug: "mia-r", providerId: "P-MIA", first: "Mia", last: "Ray", distance: "SECOND_DEGREE" });
    const steps = [{ type: "INVITE", delayDays: 0, note: "Hi {firstName}, {aiLine}" }];
    await prisma.campaign.create({ data: { id: "uni-c", workspaceId: WS, name: "AI", steps, settings: { ai: { offer: "Clinic apps", tone: "friendly", fallback: "" } } } });
    for (const [id, url] of [["cl-zoe", "zoe-t"], ["cl-mia", "mia-r"]]) {
      await prisma.campaignLead.create({ data: { id, campaignId: "uni-c", workspaceId: WS, profileUrl: `https://www.linkedin.com/in/${url}/`, accountId: ACC } });
    }
    const runAi = async (leadId: string, url: string, note: string) => {
      const id = `uni-a${++n}`;
      await prisma.action.create({ data: { id, accountId: ACC, type: "CONNECTION_REQUEST", status: "QUEUED", targetUrl: url, payload: { note }, scheduledAt: new Date(Date.now() - 1000), campaignLeadId: leadId } });
      await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client, ai: ai as never }, id);
      return prisma.action.findUniqueOrThrow({ where: { id } });
    };

    const ok = await runAi("cl-zoe", "https://www.linkedin.com/in/zoe-t/", "Hi {firstName}, {aiLine}");
    expect(ok.status).toBe("SUCCEEDED");
    expect(fake.invites.find((x) => x.providerId === "P-ZOE")?.message).toBe("Hi Zoe, Saw you're hiring, Zoe.");
    expect(asked[0]).toBeLessThanOrEqual(220);
    expect(await prisma.campaignLead.findUniqueOrThrow({ where: { id: "cl-zoe" } })).toMatchObject({ aiLine: "Saw you're hiring, Zoe.", aiSignal: "hiring" });

    // Nothing specific and no fallback: skipped, nothing generic sent.
    const skipped = await runAi("cl-mia", "https://www.linkedin.com/in/mia-r/", "Hi {firstName}, {aiLine}");
    expect(skipped).toMatchObject({ status: "SKIPPED", error: "NO_AI_LINE" });
    expect(fake.invites.some((x) => x.providerId === "P-MIA")).toBe(false);

    // With a fallback line, they get that instead.
    await prisma.campaign.update({ where: { id: "uni-c" }, data: { settings: { ai: { offer: "Clinic apps", tone: "friendly", fallback: "Always good to meet people in healthcare." } } } });
    const fb = await runAi("cl-mia", "https://www.linkedin.com/in/mia-r/", "Hi {firstName}, {aiLine}");
    expect(fb.status).toBe("SUCCEEDED");
    expect(fake.invites.find((x) => x.providerId === "P-MIA")?.message).toBe("Hi Mia, Always good to meet people in healthcare.");
    expect(await prisma.campaignLead.findUniqueOrThrow({ where: { id: "cl-mia" } })).toMatchObject({ aiSignal: "fallback" });
    // Only Zoe's line used an AI credit: Mia's empty answer was refunded, the fallback is free.
    expect(await prisma.aiCreditUse.findMany({ where: { workspaceId: WS }, select: { action: true, credits: true, ref: true } })).toEqual([{ action: "NOTE", credits: 1, ref: "cl-zoe" }]);
  });

  it("lets AI write the whole note or message for each person (1 AI credit each), and keeps sending without credits", async () => {
    const ai = {
      write: async () => ({ line: "Saw your post on remote hiring.", signal: "post" }),
      writeMessage: async (ctx: { name: string }, _s: unknown, o: { kind: string; guide: string; maxChars: number }) =>
        o.guide.includes("BAD") ? "Hi {firstName}" : `Hi ${ctx.name.split(" ")[0]}, ${o.kind === "note" ? "loved your post on remote hiring. Let's connect?" : "following up on remote hiring: worth a quick call?"}`,
    };
    fake.add({ slug: "ana-w", providerId: "P-ANA", first: "Ana", last: "Wu", distance: "SECOND_DEGREE" });
    fake.add({ slug: "ben-k", providerId: "P-BEN", first: "Ben", last: "Ko", distance: "FIRST_DEGREE" });
    fake.add({ slug: "cat-l", providerId: "P-CAT", first: "Cat", last: "Lee", distance: "SECOND_DEGREE" });
    for (const [id, url] of [["cl-ana", "ana-w"], ["cl-ben", "ben-k"], ["cl-cat", "cat-l"]]) {
      await prisma.campaignLead.create({ data: { id, campaignId: "uni-c", workspaceId: WS, profileUrl: `https://www.linkedin.com/in/${url}/`, accountId: ACC } });
    }
    const run = async (leadId: string, slug: string, type: "CONNECTION_REQUEST" | "MESSAGE", payload: Record<string, unknown>) => {
      const id = `uni-a${++n}`;
      await prisma.action.create({ data: { id, accountId: ACC, type, status: "QUEUED", targetUrl: `https://www.linkedin.com/in/${slug}/`, payload: payload as never, scheduledAt: new Date(Date.now() - 1000), campaignLeadId: leadId } });
      await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client, ai: ai as never }, id);
      return prisma.action.findUniqueOrThrow({ where: { id } });
    };
    const used = () => prisma.aiCreditUse.count({ where: { workspaceId: WS } });
    const before = await used();

    const invite = await run("cl-ana", "ana-w", "CONNECTION_REQUEST", { note: "Ask about their hiring", aiWrite: true });
    expect(invite.status).toBe("SUCCEEDED");
    expect(fake.invites.find((x) => x.providerId === "P-ANA")?.message).toBe("Hi Ana, loved your post on remote hiring. Let's connect?");
    expect((invite.payload as { result: { aiWritten?: boolean } }).result.aiWritten).toBe(true);

    // Messages wait for an inbox read since the lead's last step: one just happened.
    await prisma.campaignLead.update({ where: { id: "cl-ben" }, data: { lastActionAt: new Date(Date.now() - 3_600_000) } });
    await prisma.action.create({ data: { accountId: ACC, type: "INBOX_SYNC", status: "SUCCEEDED", scheduledAt: new Date(), executedAt: new Date() } });
    const msg = await run("cl-ben", "ben-k", "MESSAGE", { text: "Offer a call", aiWrite: true });
    expect(msg.status).toBe("SUCCEEDED");
    expect((msg.payload as { result: { aiWritten?: boolean; text?: string } }).result).toMatchObject({ aiWritten: true, text: "Hi Ben, following up on remote hiring: worth a quick call?" });
    expect(await used()).toBe(before + 2);

    // An answer that fails the checks: refunded, and the step's own text goes out.
    const bad = await run("cl-cat", "cat-l", "CONNECTION_REQUEST", { note: "Hi {firstName}, BAD guide", aiWrite: true });
    expect(bad.status).toBe("SUCCEEDED");
    expect(fake.invites.find((x) => x.providerId === "P-CAT")?.message).toBe("Hi Cat, BAD guide");
    expect(await used()).toBe(before + 2);

    // Out of AI credits: {aiLine} is left out (no fallback), the rest still goes.
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 50, aiPeriod: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), aiExtra: 0 } });
    await prisma.campaign.update({ where: { id: "uni-c" }, data: { settings: { ai: { offer: "Clinic apps", tone: "friendly", fallback: "" } } } });
    fake.add({ slug: "dan-p", providerId: "P-DAN", first: "Dan", last: "Park", distance: "SECOND_DEGREE" });
    await prisma.campaignLead.create({ data: { id: "cl-dan", campaignId: "uni-c", workspaceId: WS, profileUrl: "https://www.linkedin.com/in/dan-p/", accountId: ACC } });
    const broke = await run("cl-dan", "dan-p", "CONNECTION_REQUEST", { note: "Hi {firstName}, {aiLine} Happy to connect." });
    expect(broke.status).toBe("SUCCEEDED");
    expect(fake.invites.find((x) => x.providerId === "P-DAN")?.message).toBe("Hi Dan, Happy to connect.");
    expect(await used()).toBe(before + 2);
  });

  it("sends a handwritten card with a message (2 AI credits), and the message alone without credits", async () => {
    fake.add({ slug: "eve-h", providerId: "P-EVE", first: "Eve", last: "Hart", distance: "FIRST_DEGREE" });
    fake.add({ slug: "fay-j", providerId: "P-FAY", first: "Fay", last: "Jo", distance: "FIRST_DEGREE" });
    for (const [id, url] of [["cl-eve", "eve-h"], ["cl-fay", "fay-j"]]) {
      await prisma.campaignLead.create({ data: { id, campaignId: "uni-c", workspaceId: WS, profileUrl: `https://www.linkedin.com/in/${url}/`, accountId: ACC, lastActionAt: new Date(Date.now() - 3_600_000) } });
    }
    const run = async (leadId: string, slug: string, payload: Record<string, unknown>) => {
      const id = `uni-a${++n}`;
      await prisma.action.create({ data: { accountId: ACC, type: "INBOX_SYNC", status: "SUCCEEDED", scheduledAt: new Date(), executedAt: new Date() } });
      await prisma.action.create({ data: { id, accountId: ACC, type: "MESSAGE", status: "QUEUED", targetUrl: `https://www.linkedin.com/in/${slug}/`, payload: payload as never, scheduledAt: new Date(Date.now() - 1000), campaignLeadId: leadId } });
      await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client }, id);
      return prisma.action.findUniqueOrThrow({ where: { id } });
    };
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 0, aiPeriod: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), aiExtra: 0 } });
    const before = await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "HANDWRITTEN" } });

    const sent = await run("cl-eve", "eve-h", { text: "Hi {firstName}, a small note for you.", card: { text: "Thanks {firstName}!", style: "lined", font: "neat" } });
    expect(sent.status).toBe("SUCCEEDED");
    expect((sent.payload as { result: { card?: boolean } }).result.card).toBe(true);
    expect(fake.attachments.find((a) => a.providerId === "P-EVE")).toMatchObject({ type: "image/png" });
    expect(fake.attachments.find((a) => a.providerId === "P-EVE")!.bytes).toBeGreaterThan(5_000);
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "HANDWRITTEN", credits: 2, ref: "cl-eve" } })).toBe(1);

    // No credits left: the message goes without the card.
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 50, aiExtra: 0 } });
    const plain = await run("cl-fay", "fay-j", { text: "Hi {firstName}, a small note for you.", card: { text: "Thanks!", style: "plain", font: "pen", ink: "black" } });
    expect(plain.status).toBe("SUCCEEDED");
    expect(fake.attachments.some((a) => a.providerId === "P-FAY")).toBe(false);
    expect(fake.chats.find((c) => c.providerId === "P-FAY")?.messages.at(-1)?.text).toBe("Hi Fay, a small note for you.");
    expect(await prisma.aiCreditUse.count({ where: { workspaceId: WS, action: "HANDWRITTEN" } })).toBe(before + 1);
  }, 30_000);

  it("sends a voice note in the customer's voice (5 AI credits), with or without text, and pays back what isn't sent", async () => {
    const spoken: { voiceId: string; text: string }[] = [];
    let refuse = false;
    const voice = {
      clone: async () => "v",
      speak: async (voiceId: string, text: string) => {
        if (refuse) throw new VoiceError("The voice service account is out of characters this month.");
        spoken.push({ voiceId, text });
        return Buffer.from("ID3 fake mp3 audio");
      },
      remove: async () => undefined,
    };
    await prisma.voiceClone.create({ data: { id: "vc-1", workspaceId: WS, name: "Tahur", providerVoiceId: "el-voice-1", consentAt: new Date(), consentByUserId: "u1" } });
    const people = [["gus-k", "P-GUS", "Gus"], ["hal-m", "P-HAL", "Hal"], ["ivy-n", "P-IVY", "Ivy"], ["jo-p", "P-JO", "Jo"]] as const;
    for (const [slug, pid, first] of people) {
      fake.add({ slug, providerId: pid, first, last: "Test", distance: "FIRST_DEGREE" });
      await prisma.campaignLead.create({ data: { id: `cl-${slug}`, campaignId: "uni-c", workspaceId: WS, profileUrl: `https://www.linkedin.com/in/${slug}/`, accountId: ACC, lastActionAt: new Date(Date.now() - 3_600_000) } });
    }
    const run = async (slug: string, payload: Record<string, unknown>) => {
      const id = `uni-a${++n}`;
      await prisma.action.create({ data: { accountId: ACC, type: "INBOX_SYNC", status: "SUCCEEDED", scheduledAt: new Date(), executedAt: new Date() } });
      await prisma.action.create({ data: { id, accountId: ACC, type: "MESSAGE", status: "QUEUED", targetUrl: `https://www.linkedin.com/in/${slug}/`, payload: payload as never, scheduledAt: new Date(Date.now() - 1000), campaignLeadId: `cl-${slug}` } });
      await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client, voice }, id);
      return prisma.action.findUniqueOrThrow({ where: { id } });
    };
    const used = (action: string) => prisma.aiCreditUse.aggregate({ where: { workspaceId: WS, action }, _sum: { credits: true } }).then((r) => r._sum.credits ?? 0);
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 0, aiExtra: 0, aiPeriod: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } });
    const v0 = await used("VOICE");

    // Voice note alone: read with their name, sent as a voice message.
    const alone = await run("gus-k", { text: "", voice: { voiceId: "vc-1", script: "Hey {firstName}, quick hello from me!" } });
    expect([alone.status, alone.error]).toEqual(["SUCCEEDED", null]);
    expect(spoken.at(-1)).toEqual({ voiceId: "el-voice-1", text: "Hey Gus, quick hello from me!" });
    expect(fake.voiceMessages.filter((m) => m.providerId === "P-GUS")).toHaveLength(1);
    expect(fake.voiceMessages.at(-1)!.type).toMatch(/^audio\//);
    expect(await used("VOICE")).toBe(v0 + 5);

    // With text: the text first, then the voice note.
    await run("hal-m", { text: "Hi {firstName}, sent you a voice note.", voice: { voiceId: "vc-1", script: "Hi {firstName}!" } });
    expect(fake.chats.find((c) => c.providerId === "P-HAL")?.messages.map((m) => m.text)).toEqual(["Hi Hal, sent you a voice note.", ""]);
    expect(await used("VOICE")).toBe(v0 + 10);

    // The voice message fails to send: the text still went, the 5 credits come back.
    fake.failVoice = true;
    const half = await run("ivy-n", { text: "Hello {firstName}", voice: { voiceId: "vc-1", script: "Hi!" } });
    fake.failVoice = false;
    expect(half.status).toBe("SUCCEEDED");
    expect((half.payload as { result: { voiceProblem?: string } }).result.voiceProblem).toMatch(/VOICE_NOT_SENT/);
    expect(await used("VOICE")).toBe(v0 + 10);

    // The voice service refuses and there's nothing else: fails, credits back. A deleted voice: skipped.
    refuse = true;
    const refused = await run("jo-p", { text: "", voice: { voiceId: "vc-1", script: "Hi!" } });
    refuse = false;
    expect(refused.status).not.toBe("SUCCEEDED");
    expect(await used("VOICE")).toBe(v0 + 10);
    const gone = await run("jo-p", { text: "", voice: { voiceId: "vc-deleted", script: "Hi!" } });
    expect(gone.status).toBe("SKIPPED");
  });

  it("sends a video note: their recording with the greeting re-spoken and lip-synced (15 AI credits)", async () => {
    // A short recording in a scratch video folder.
    const dir = mkdtempSync(path.join(tmpdir(), "uni-video-"));
    process.env.VIDEO_DIR = dir;
    mkdirSync(path.join(dir, WS));
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=6", "-f", "lavfi", "-i", "sine=frequency=300:duration=6", "-c:v", "libx264", "-c:a", "aac", "-shortest", path.join(dir, WS, "rec.mp4")]);
    const greet = path.join(dir, "greet.mp3");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=500:duration=1.2", "-c:a", "libmp3lame", greet]);
    const spoken: string[] = [];
    const voice = { clone: async () => "v", speak: async (_v: string, text: string) => (spoken.push(text), (await import("node:fs")).readFileSync(greet)), remove: async () => undefined };
    let refuse = false;
    let synced = 0;
    const lipsync = {
      async sync(video: Buffer) {
        if (refuse) throw new VideoError("The lip-sync service account is out of credit.");
        synced++;
        return video; // the face clip back as it is (no sound): the greeting audio is ours
      },
    };
    await prisma.voiceClone.create({ data: { id: "vc-v", workspaceId: WS, name: "Me", providerVoiceId: "el-v", consentAt: new Date(), consentByUserId: "u1" } });
    const rec = { workspaceId: WS, name: "Intro", file: `${WS}/rec.mp4`, poster: `${WS}/rec.jpg`, durationMs: 6000, introMs: 2000, width: 640, height: 360, consentAt: new Date(), consentByUserId: "u1" };
    await prisma.videoRecording.create({ data: { id: "vr-1", voiceId: "vc-v", ...rec } });
    await prisma.videoRecording.create({ data: { id: "vr-novoice", ...rec } });
    const people = [["kim-a", "P-KIM", "Kim"], ["lee-b", "P-LEE", "Lee"], ["max-c", "P-MAX", "Max"], ["ned-d", "P-NED", "Ned"]] as const;
    for (const [slug, pid, first] of people) {
      fake.add({ slug, providerId: pid, first, last: "Test", distance: "FIRST_DEGREE" });
      await prisma.campaignLead.create({ data: { id: `cl-${slug}`, campaignId: "uni-c", workspaceId: WS, profileUrl: `https://www.linkedin.com/in/${slug}/`, accountId: ACC, lastActionAt: new Date(Date.now() - 3_600_000) } });
    }
    const run = async (slug: string, payload: Record<string, unknown>) => {
      const id = `uni-a${++n}`;
      await prisma.action.create({ data: { accountId: ACC, type: "INBOX_SYNC", status: "SUCCEEDED", scheduledAt: new Date(), executedAt: new Date() } });
      await prisma.action.create({ data: { id, accountId: ACC, type: "MESSAGE", status: "QUEUED", targetUrl: `https://www.linkedin.com/in/${slug}/`, payload: payload as never, scheduledAt: new Date(Date.now() - 1000), campaignLeadId: `cl-${slug}` } });
      await processAction({ prisma, session, pacing: memoryPacingStore(), ignoreWorkingHours: true, gapScale: 0.001, unipile: client, voice, lipsync }, id);
      return prisma.action.findUniqueOrThrow({ where: { id } });
    };
    const used = () => prisma.aiCreditUse.aggregate({ where: { workspaceId: WS, action: "VIDEO" }, _sum: { credits: true } }).then((r) => r._sum.credits ?? 0);
    await prisma.workspace.update({ where: { id: WS }, data: { aiUsed: 0, aiExtra: 0 } });

    // The video alone: greeting with their name, sent as a video message that plays in the chat.
    const alone = await run("kim-a", { text: "", video: { videoId: "vr-1", intro: "Hi {firstName}," } });
    expect([alone.status, alone.error]).toEqual(["SUCCEEDED", null]);
    expect(spoken.at(-1)).toBe("Hi Kim,");
    expect(synced).toBe(1);
    expect(fake.videoMessages.filter((m) => m.providerId === "P-KIM")).toEqual([expect.objectContaining({ type: "video/mp4" })]);
    expect(fake.videoMessages.at(-1)!.bytes).toBeGreaterThan(10_000);
    expect(await used()).toBe(15);

    // Text, a voice note and a video: three messages, text first.
    await run("lee-b", { text: "Hi {firstName}!", voice: { voiceId: "vc-v", script: "Hello {firstName}" }, video: { videoId: "vr-1", intro: "Hey {firstName}," } });
    expect(fake.chats.find((c) => c.providerId === "P-LEE")?.messages.map((m) => m.text)).toEqual(["Hi Lee!", "", ""]);
    expect(fake.videoMessages.some((m) => m.providerId === "P-LEE")).toBe(true);
    expect(await used()).toBe(30);

    // The video fails to send: the text still went, the 15 credits come back.
    fake.failVideo = true;
    const half = await run("max-c", { text: "Hello {firstName}", video: { videoId: "vr-1", intro: "Hi {firstName}," } });
    fake.failVideo = false;
    expect(half.status).toBe("SUCCEEDED");
    expect((half.payload as { result: { videoProblem?: string } }).result.videoProblem).toMatch(/VIDEO_NOT_SENT/);
    expect(await used()).toBe(30);

    // Lip-sync refuses and there's nothing else: not sent, credits back. No voice for the recording: skipped.
    refuse = true;
    const refused = await run("ned-d", { text: "", video: { videoId: "vr-1", intro: "Hi {firstName}," } });
    refuse = false;
    expect(refused.status).not.toBe("SUCCEEDED");
    expect(await used()).toBe(30);
    const noVoice = await run("ned-d", { text: "", video: { videoId: "vr-novoice", intro: "Hi {firstName}," } });
    expect([noVoice.status, noVoice.error]).toEqual(["SKIPPED", "NO_VIDEO"]);
  }, 90_000);
});
