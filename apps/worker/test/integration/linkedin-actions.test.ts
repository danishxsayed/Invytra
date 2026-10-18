import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountLock } from "../../src/browser/account-lock.js";
import { withAccountSession, type SessionManagerDeps } from "../../src/browser/session-manager.js";
import type { BrowserAccount, SessionTaskContext, StorageState } from "../../src/browser/types.js";
import {
  InviteLimitReachedError,
  checkConnectionStatus,
  fetchInbox,
  isOwnMessage,
  sendConnectionRequest,
  sendMessage,
  visitProfile,
} from "../../src/linkedin/actions.js";
import { normalizeProfileUrl } from "../../src/linkedin/profile.js";
import { FakeRedis } from "../fake-redis.js";
import { startFakeLinkedIn, type FakeState } from "../fake-linkedin.js";

let server: Server;
let state: FakeState;
let deps: SessionManagerDeps;
let base: string;

const account: BrowserAccount = { id: "acc-1", label: "t", proxyUrl: "", timezone: "Asia/Kolkata", status: "ACTIVE" };

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
const url = (slug: string) => `https://www.linkedin.com/in/${slug}/?utm_source=x`;

describe("normalizeProfileUrl", () => {
  it("keeps only /in/<slug>/ on the base URL", () =>
    expect(normalizeProfileUrl("https://linkedin.com/in/alice-smith-123?trk=abc", "https://www.linkedin.com")).toBe(
      "https://www.linkedin.com/in/alice-smith-123/",
    ));
  it("rejects non-profile URLs", () =>
    expect(() => normalizeProfileUrl("https://www.linkedin.com/company/acme", "https://www.linkedin.com")).toThrow(/profile/));
});

describe("LinkedIn actions (fake site)", { timeout: 60_000 }, () => {
  it("visits a profile and reads name, headline and status", async () => {
    const r = await run((ctx) => visitProfile(ctx, url("alice")));
    expect(r).toMatchObject({ outcome: "DONE", data: { name: "Alice Smith", headline: "Founder at Acme", status: "NOT_CONNECTED" } });
  });

  it("reads the pre-2026 profile layout too", async () => {
    const r = await run((ctx) => visitProfile(ctx, url("olga")));
    expect(r).toMatchObject({ outcome: "DONE", data: { name: "Olga Old", headline: "Old layout person", status: "NOT_CONNECTED" } });
  });

  it("invites on the pre-2026 layout", async () => {
    expect(await run((ctx) => sendConnectionRequest(ctx, url("olga")))).toMatchObject({ outcome: "DONE" });
    expect(state.invites.at(-1)).toEqual({ slug: "olga", note: null });
  });

  it("ignores '1st' in the About section when the profile is 2nd-degree", async () => {
    expect(await run((ctx) => checkConnectionStatus(ctx, url("alice")))).toMatchObject({ data: { status: "NOT_CONNECTED" } });
  });

  it("reports connected and pending profiles", async () => {
    expect(await run((ctx) => checkConnectionStatus(ctx, url("carol")))).toMatchObject({ data: { status: "CONNECTED" } });
    expect(await run((ctx) => checkConnectionStatus(ctx, url("dave")))).toMatchObject({ data: { status: "PENDING" } });
  });

  it("skips a profile that does not exist", async () => {
    expect(await run((ctx) => visitProfile(ctx, url("ghost")))).toMatchObject({ outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" });
  });

  it("sends an invitation with a note to the right person only", async () => {
    const r = await run((ctx) => sendConnectionRequest(ctx, url("alice"), "Hi Alice, loved your post on SaaS pricing."));
    expect(r).toMatchObject({ outcome: "DONE", data: { name: "Alice Smith", withNote: true } });
    expect(state.invites.at(-1)).toEqual({ slug: "alice", note: "Hi Alice, loved your post on SaaS pricing." });
    expect(state.invites.filter((i) => i.slug === "alice")).toHaveLength(1);
  });

  it("does not invite someone who is already pending", async () => {
    const before = state.invites.length;
    expect(await run((ctx) => sendConnectionRequest(ctx, url("alice")))).toMatchObject({ outcome: "SKIPPED", reason: "PENDING" });
    expect(state.invites).toHaveLength(before);
  });

  it("finds Connect under the More menu and sends without a note", async () => {
    const r = await run((ctx) => sendConnectionRequest(ctx, url("bob")));
    expect(r).toMatchObject({ outcome: "DONE", data: { withNote: false } });
    expect(state.invites.at(-1)).toEqual({ slug: "bob", note: null });
  });

  it("does not invite existing connections", async () => {
    expect(await run((ctx) => sendConnectionRequest(ctx, url("carol")))).toMatchObject({ outcome: "SKIPPED", reason: "CONNECTED" });
  });

  it("skips when LinkedIn asks for the person's email", async () => {
    expect(await run((ctx) => sendConnectionRequest(ctx, url("erin")))).toMatchObject({ outcome: "SKIPPED", reason: "EMAIL_REQUIRED" });
  });

  it("stops on LinkedIn's weekly invitation limit", async () => {
    await expect(run((ctx) => sendConnectionRequest(ctx, url("frank")))).rejects.toBeInstanceOf(InviteLimitReachedError);
  });

  it("rejects notes over 300 characters before opening LinkedIn", async () => {
    await expect(run((ctx) => sendConnectionRequest(ctx, url("erin"), "x".repeat(301)))).rejects.toThrow(/300/);
  });

  it("messages a 1st-degree connection", async () => {
    const r = await run((ctx) => sendMessage(ctx, url("carol"), "Hi Carol — quick question about Gamma's sales stack."));
    expect(r).toMatchObject({ outcome: "DONE", data: { name: "Carol White" } });
    expect(state.messages).toEqual([{ slug: "carol", text: "Hi Carol — quick question about Gamma's sales stack." }]);
  });

  it("never messages someone who is not connected", async () => {
    const r = await run((ctx) => sendMessage(ctx, url("dave"), "hello"));
    expect(r).toMatchObject({ outcome: "SKIPPED" });
    expect(state.messages).toHaveLength(1);
  });

  it("reads the inbox, de-duplicates threads and flags unread", async () => {
    const r = await run((ctx) => fetchInbox(ctx));
    expect(r.outcome).toBe("DONE");
    const threads = r.outcome === "DONE" ? r.data.threads : [];
    expect(threads.map((t) => t.threadId)).toEqual(["T1", "T2", "T3"]);
    expect(threads[0]).toMatchObject({ name: "Carol White", snippet: "Sure, let's talk Tuesday", unread: true });
    expect(threads[1]!.unread).toBe(false);
    expect(threads.filter((t) => !isOwnMessage(t.snippet)).map((t) => t.name)).toEqual(["Carol White", "Bob Jones"]);
  });
});
