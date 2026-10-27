/** Search pages, likes and withdrawals against the fake LinkedIn. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountLock } from "../../src/browser/account-lock.js";
import { withAccountSession, type SessionManagerDeps } from "../../src/browser/session-manager.js";
import type { BrowserAccount, SessionTaskContext, StorageState } from "../../src/browser/types.js";
import { sendConnectionRequest } from "../../src/linkedin/actions.js";
import { likeLatestPost, withdrawInvite } from "../../src/linkedin/engage.js";
import { fetchInbox } from "../../src/linkedin/inbox.js";
import { sendReply } from "../../src/linkedin/reply.js";
import { companyFromHeadline, readSearchPage } from "../../src/linkedin/search.js";
import { FakeRedis } from "../fake-redis.js";
import { startFakeLinkedIn, type FakeState } from "../fake-linkedin.js";

let server: Server;
let state: FakeState;
let deps: SessionManagerDeps;
let base: string;
const account: BrowserAccount = { id: "acc-s", label: "t", proxyUrl: "", timezone: "Asia/Kolkata", status: "ACTIVE" };

beforeAll(async () => {
  ({ server, state } = startFakeLinkedIn());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const session: StorageState = {
    cookies: [{ name: "li_at", value: "valid", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
    origins: [],
  };
  deps = {
    accounts: { get: async () => account, markNeedsAttention: async () => undefined, touch: async () => undefined },
    sessions: { load: async () => session, save: async () => undefined },
    lock: new AccountLock(new FakeRedis()),
    baseUrl: base,
    screenshotDir: await mkdtemp(join(tmpdir(), "invytra-")),
    launch: { headless: true, allowNoProxy: true },
  };
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const run = <T>(fn: (ctx: SessionTaskContext) => Promise<T>) => withAccountSession(account.id, fn, deps);
const url = (slug: string) => `https://www.linkedin.com/in/${slug}/`;

describe("company from a headline", () => {
  it("takes what follows “at”", () => {
    expect(companyFromHeadline("Founder at Acme")).toBe("Acme");
    expect(companyFromHeadline("CTO @ Beta | Investor")).toBe("Beta");
    expect(companyFromHeadline("Engineer")).toBeNull();
  });
});

describe("reading search pages (fake site)", { timeout: 60_000 }, () => {
  it("reads a LinkedIn people search page: names, headlines, locations; skips hidden members", async () => {
    const r = await run((ctx) => readSearchPage(ctx, `${base}/search/results/people/?keywords=founders`, "LINKEDIN_SEARCH"));
    expect(r.outcome).toBe("DONE");
    const d = (r as { data: { people: { profileUrl: string; firstName: string | null; lastName: string | null; title: string | null; company: string | null; location: string | null }[]; hasNext: boolean } }).data;
    expect(d.people.map((p) => p.profileUrl.replace("https://www.linkedin.com", ""))).toEqual(["/in/alice/", "/in/bob/", "/in/olga/", "/in/ivan/"]);
    expect(d.people[0]).toMatchObject({ firstName: "Alice", lastName: "Smith", title: "Founder at Acme", company: "Acme", location: "Pune, Maharashtra, India" });
    expect(d.people[2]).toMatchObject({ firstName: "Olga", lastName: "Old", degree: 3 }); // ", MBA" dropped
    expect(d.people[0]).toMatchObject({ degree: 2, premium: false });
    expect(d.hasNext).toBe(true);
  });

  it("knows the last page", async () => {
    const r = await run((ctx) => readSearchPage(ctx, `${base}/search/results/people/?keywords=founders&page=2`, "LINKEDIN_SEARCH"));
    expect(r).toMatchObject({ outcome: "DONE", data: { hasNext: false } });
    expect((r as { data: { people: { firstName: string | null; premium?: boolean }[] } }).data.people.find((p) => p.firstName === "Pam")).toMatchObject({ premium: true });
    const r3 = await run((ctx) => readSearchPage(ctx, `${base}/search/results/people/?keywords=founders&page=3`, "LINKEDIN_SEARCH"));
    expect(r3).toMatchObject({ outcome: "DONE", data: { people: [], hasNext: false } });
  });

  it("stops at LinkedIn's monthly search limit", async () => {
    expect(await run((ctx) => readSearchPage(ctx, `${base}/search/results/people/?keywords=limit`, "LINKEDIN_SEARCH"))).toMatchObject({
      outcome: "SKIPPED",
      reason: "SEARCH_LIMIT",
    });
  });

  it("reads Sales Navigator results (which load on scroll) as member-id profile links", async () => {
    const r = await run((ctx) => readSearchPage(ctx, `${base}/sales/search/people?query=(keywords%3Acto)`, "SALES_NAV_SEARCH"));
    expect(r).toMatchObject({
      outcome: "DONE",
      data: {
        hasNext: true,
        people: [
          { profileUrl: "https://www.linkedin.com/in/ACwAAAalice0001XyZ/", firstName: "Alice", lastName: "Smith", title: "Founder", company: "Acme", location: "Mumbai, India" },
          { profileUrl: "https://www.linkedin.com/in/ACwAAAbob00002XyZ/", firstName: "Bob" },
        ],
      },
    });
  });

  it("says so when the account has no Sales Navigator", async () => {
    expect(await run((ctx) => readSearchPage(ctx, `${base}/sales/search/people?query=nosales`, "SALES_NAV_SEARCH"))).toMatchObject({
      outcome: "SKIPPED",
      reason: "NO_SALES_NAV",
    });
  });
});

describe("liking and withdrawing (fake site)", { timeout: 60_000 }, () => {
  it("likes the newest post only", async () => {
    expect(await run((ctx) => likeLatestPost(ctx, url("alice")))).toMatchObject({ outcome: "DONE" });
    expect(state.likes).toEqual(["alice#p1"]);
  });
  it("skips people without posts, or whose latest post is already liked", async () => {
    expect(await run((ctx) => likeLatestPost(ctx, url("bob")))).toMatchObject({ outcome: "SKIPPED", reason: "NO_POSTS" });
    expect(await run((ctx) => likeLatestPost(ctx, url("carol")))).toMatchObject({ outcome: "SKIPPED", reason: "ALREADY_LIKED" });
  });
  it("withdraws a pending invite, and leaves others alone", async () => {
    expect(await run((ctx) => sendConnectionRequest(ctx, url("alice")))).toMatchObject({ outcome: "DONE" });
    expect(await run((ctx) => withdrawInvite(ctx, url("alice")))).toMatchObject({ outcome: "DONE", data: { name: "Alice Smith" } });
    expect(state.withdrawn).toEqual(["alice"]);
    expect(await run((ctx) => withdrawInvite(ctx, url("carol")))).toMatchObject({ outcome: "SKIPPED", reason: "CONNECTED" });
    expect(await run((ctx) => withdrawInvite(ctx, url("bob")))).toMatchObject({ outcome: "SKIPPED", reason: "NOT_PENDING" });
  });
});

describe("replying from the inbox (fake site)", { timeout: 60_000 }, () => {
  it("opens the conversation by name, sends, and confirms it", async () => {
    expect(await run((ctx) => sendReply(ctx, "Carol White", "Tuesday works, talk then!"))).toMatchObject({ outcome: "DONE", data: { via: "inbox" } });
    expect(state.inboxReplies).toEqual([{ name: "Carol White", text: "Tuesday works, talk then!" }]);
  });
  it("falls back to the person's profile when the conversation isn't in the list", async () => {
    expect(await run((ctx) => sendReply(ctx, "Carol W.", "Following up here.", url("carol")))).toMatchObject({ outcome: "DONE", data: { via: "profile" } });
    expect(state.messages.at(-1)).toEqual({ slug: "carol", text: "Following up here." });
  });
  it("says so when it can't find the conversation and has no profile", async () => {
    await expect(run((ctx) => sendReply(ctx, "Nobody Here", "Hi"))).rejects.toThrow(/isn't in the recent messages/);
  });
});

describe("reading whole conversations (fake site)", { timeout: 60_000 }, () => {
  it("opens new or changed chats and reads both sides, with LinkedIn's time labels", async () => {
    const r = await run((ctx) => fetchInbox(ctx, { known: {} }));
    const threads = (r as { data: { threads: { name: string; messageKey: string; messages?: { fromMe: boolean; text: string; dateLabel: string; timeLabel: string }[] }[] } }).data.threads;
    const carol = threads.find((t) => t.name === "Carol White")!;
    expect(carol.messages!.slice(0, 3)).toEqual([
      { fromMe: true, text: "Hi Carol, I am reaching out to connect with other leaders in sales.", dateLabel: "OCT 18", timeLabel: "12:14 PM" },
      { fromMe: false, text: "I'm happy to connect", dateLabel: "OCT 18", timeLabel: "12:15 PM" },
      { fromMe: false, text: "Sure, let's talk Tuesday", dateLabel: "TODAY", timeLabel: "11:02 AM" },
    ]);
    // Next time, unchanged and read chats are left alone.
    const known = Object.fromEntries(threads.map((t) => [t.name, t.messageKey]));
    const again = await run((ctx) => fetchInbox(ctx, { known }));
    const reread = (again as { data: { threads: { name: string; unread: boolean; messages?: unknown[] }[] } }).data.threads.filter((t) => t.messages && !t.unread);
    expect(reread).toEqual([]);
  });
  it("opens at most a few chats per check", async () => {
    const r = await run((ctx) => fetchInbox(ctx, { known: {}, maxOpen: 1 }));
    expect((r as { data: { threads: { messages?: unknown[] }[] } }).data.threads.filter((t) => t.messages).length).toBe(1);
  });
});
