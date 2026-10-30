/**
 * Live "connect account" flow end to end: dashboard ticket → WebSocket →
 * streamed browser → typed login on a fake LinkedIn → encrypted session saved.
 * No real LinkedIn and no database (Prisma is stubbed).
 */
import { signConnectTicket, type PrismaClient } from "@invytra/db";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { AccountLock } from "../../src/browser/account-lock.js";
import type { StorageState } from "../../src/browser/types.js";
import { createConnectServer } from "../../src/connect/server.js";
import { startFakeLinkedIn, type FakeState } from "../fake-linkedin.js";
import { FakeRedis } from "../fake-redis.js";

const KEY = randomBytes(32).toString("base64");
const ORIGIN = "http://dashboard.test";

const account = {
  id: "acc-1",
  workspaceId: "ws-1",
  label: "sales-1",
  proxyUrl: "",
  timezone: "Asia/Kolkata",
  status: "DISCONNECTED",
  connectedAt: null,
};

let fake: { server: Server; state: FakeState };
let connect: ReturnType<typeof createConnectServer>;
let wsUrl: string;
const redis = new FakeRedis();
const lock = new AccountLock(redis);
const saved: StorageState[] = [];
const updates: unknown[] = [];
/** Other accounts in the workspace (for the "same LinkedIn profile twice" check). */
let others: { label: string; workspaceId: string; profileName: string | null; profileUrl: string | null }[] = [];

const prisma = {
  linkedinAccount: {
    findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) =>
      where.id === account.id && where.workspaceId === account.workspaceId ? account : null,
    findMany: async () => others,
    update: async (args: unknown) => {
      updates.push(args);
      return account;
    },
  },
} as unknown as PrismaClient;

beforeAll(async () => {
  fake = startFakeLinkedIn();
  await new Promise<void>((r) => fake.server.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
  connect = createConnectServer({
    prisma,
    sessions: { load: async () => null, save: async (_id, s) => void saved.push(s) },
    lock,
    tickets: { set: (k, v, _ex, s, _nx) => redis.set(k, v, "PX", s * 1000, "NX") },
    encryptionKey: KEY,
    baseUrl,
    launch: { headless: true, allowNoProxy: true },
    allowedOrigins: [ORIGIN],
  });
  await new Promise<void>((r) => connect.server.listen(0, "127.0.0.1", r));
  wsUrl = `ws://127.0.0.1:${(connect.server.address() as AddressInfo).port}/connect`;
});

afterAll(async () => {
  await connect.closeAll();
  fake.server.close();
});

interface Session {
  ws: WebSocket;
  statuses: { phase: string; message: string; profileName?: string | null }[];
  frames: number;
  urls: string[];
  waitFor(pred: () => boolean, ms?: number): Promise<void>;
  send(m: object): void;
}

function open(ticket: string, origin = ORIGIN): Session {
  const ws = new WebSocket(`${wsUrl}?ticket=${encodeURIComponent(ticket)}`, { origin });
  const s: Session = {
    ws,
    statuses: [],
    frames: 0,
    urls: [],
    async waitFor(pred, ms = 30_000) {
      const end = Date.now() + ms;
      while (!pred()) {
        if (Date.now() > end) throw new Error(`timed out; statuses: ${JSON.stringify(s.statuses)}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    send: (m) => ws.send(JSON.stringify(m)),
  };
  ws.on("message", (data, isBinary) => {
    if (isBinary) return void s.frames++;
    const m = JSON.parse(data.toString());
    if (m.t === "status") s.statuses.push(m);
    if (m.t === "url") s.urls.push(m.url);
  });
  ws.on("error", () => undefined);
  return s;
}

const ticket = (over: Partial<{ accountId: string; workspaceId: string }> = {}) =>
  signConnectTicket({ accountId: account.id, workspaceId: account.workspaceId, userId: "u1", ...over }, KEY);
const last = (s: Session) => s.statuses.at(-1);

describe("connect server", () => {
  it("streams the login page, takes typed input, and saves the session on success", async () => {
    const t = await ticket();
    const s = open(t);
    await s.waitFor(() => last(s)?.phase === "ready" && s.frames > 0 && s.urls.length > 0);
    expect(s.urls.at(-1)).toMatch(/\/login$/);

    // The email box has focus: type it key by key, Tab to the password, paste it, press Enter.
    for (const ch of "me@acme.io") s.send({ t: "key", key: ch, mods: {} });
    s.send({ t: "key", key: "Tab", mods: {} });
    s.send({ t: "text", text: "right-password" });
    s.send({ t: "mouse", type: "move", x: 0.5, y: 0.5 });
    s.send({ t: "key", key: "Enter", mods: {} });

    await s.waitFor(() => last(s)?.phase === "done", 45_000);
    expect(last(s)?.profileName).toBe("Tess Tester");
    expect(fake.state.logins).toEqual(["me@acme.io"]);
    expect(saved.at(-1)?.cookies.some((c) => c.name === "li_at" && c.value === "valid")).toBe(true);
    expect(updates.at(-1)).toMatchObject({
      where: { id: account.id },
      data: { status: "ACTIVE", statusReason: null, profileName: "Tess Tester" },
    });
    expect(JSON.stringify(updates.at(-1))).toContain("/in/tess/");
    // Their own profile photo is saved with the account.
    expect(updates.at(-1)).toMatchObject({ data: { avatarType: "image/png" } });
    await s.waitFor(() => s.ws.readyState === WebSocket.CLOSED);
    await s.waitFor(() => connect.active() === 0);
    // The account lock was released.
    const again = await lock.acquire(account.id);
    expect(again).not.toBeNull();
    await lock.release(account.id, again!);

    // The same ticket cannot be used twice.
    const reuse = open(t);
    await reuse.waitFor(() => reuse.statuses.length > 0);
    expect(last(reuse)?.message).toMatch(/already used/);
  }, 90_000);

  it("doesn't save a LinkedIn profile that another account here is already logged in to", async () => {
    others = [{ label: "test-1", workspaceId: "ws-1", profileName: "Tess Tester", profileUrl: "https://www.linkedin.com/in/tess/" }];
    const savedBefore = saved.length;
    const updatesBefore = updates.length;
    try {
      const s = open(await ticket());
      await s.waitFor(() => last(s)?.phase === "ready" && s.urls.length > 0);
      for (const ch of "me@acme.io") s.send({ t: "key", key: ch, mods: {} });
      s.send({ t: "key", key: "Tab", mods: {} });
      s.send({ t: "text", text: "right-password" });
      s.send({ t: "key", key: "Enter", mods: {} });
      await s.waitFor(() => last(s)?.phase === "error", 45_000);
      expect(last(s)?.message).toMatch(/already connected here as “test-1”/);
      expect(saved.length).toBe(savedBefore);
      expect(updates.length).toBe(updatesBefore);
      await s.waitFor(() => connect.active() === 0);
    } finally {
      others = [];
    }
  }, 90_000);

  it("refuses other dashboards, foreign accounts, bad tickets and busy accounts", async () => {
    const wrongOrigin = open(await ticket(), "http://evil.test");
    const err = await new Promise<string>((r) => wrongOrigin.ws.on("unexpected-response", (_q, res) => r(String(res.statusCode))));
    expect(err).toBe("403");

    const foreign = open(await ticket({ workspaceId: "ws-2" }));
    await foreign.waitFor(() => foreign.statuses.length > 0);
    expect(last(foreign)?.message).toBe("Account not found.");

    const bad = open("not-a-ticket");
    await bad.waitFor(() => bad.statuses.length > 0);
    expect(last(bad)?.message).toMatch(/expired/);

    const held = await lock.acquire(account.id);
    const busy = open(await ticket());
    await busy.waitFor(() => busy.statuses.length > 0);
    expect(last(busy)?.message).toMatch(/busy/);
    await lock.release(account.id, held!);
  }, 30_000);

  it("closes the browser when the viewer cancels, and frees the account", async () => {
    const s = open(await ticket());
    await s.waitFor(() => last(s)?.phase === "ready");
    s.send({ t: "cancel" });
    await s.waitFor(() => last(s)?.phase === "error");
    expect(last(s)?.message).toBe("Login cancelled.");
    await s.waitFor(() => connect.active() === 0);
    const t = await lock.acquire(account.id);
    expect(t).not.toBeNull();
    await lock.release(account.id, t!);
  }, 60_000);
});
