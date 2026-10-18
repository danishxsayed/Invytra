/**
 * Real-browser test of the session manager against a small fake LinkedIn
 * served from localhost. No real LinkedIn account or network is touched.
 */
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccountLock } from "../../src/browser/account-lock.js";
import {
  AccountBusyError,
  AccountNeedsAttentionError,
  AccountUnavailableError,
  SessionRequiredError,
} from "../../src/browser/errors.js";
import { withAccountSession, type SessionManagerDeps } from "../../src/browser/session-manager.js";
import type { BrowserAccount, StorageState } from "../../src/browser/types.js";
import { FakeRedis } from "../fake-redis.js";

const html = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeLinkedIn(): Server {
  return createServer((req, res) => {
    const cookie = req.headers.cookie ?? "";
    const session = /li_at=([^;]+)/.exec(cookie)?.[1];
    const path = (req.url ?? "/").split("?")[0]!;
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html", ...headers });
      res.end(body);
    };
    const redirect = (to: string) => send(302, "", { location: to });

    if (path.startsWith("/feed")) {
      if (session === "valid") return send(200, html("Feed | LinkedIn", "<h1>Start a post</h1>"), {
        "set-cookie": "lidc=refreshed; Path=/",
      });
      if (session === "flagged") return redirect("/checkpoint/challenge/AgFabc");
      if (session === "restricted") return send(200, html("LinkedIn", "Your account has been restricted"));
      if (session === "captcha")
        return send(200, html("LinkedIn", '<iframe src="/captcha-widget" title="captcha"></iframe>'));
      return redirect("/login");
    }
    if (path.startsWith("/in/")) return send(200, html("Someone | LinkedIn", "<h1>Someone</h1>"));
    if (path.startsWith("/checkpoint/")) return send(200, html("Security Verification", "Verify it's you"));
    if (path.startsWith("/login")) return send(200, html("LinkedIn Login", "<form>Sign in</form>"));
    send(200, html("LinkedIn", "ok"));
  });
}

let server: Server;
let baseUrl: string;
let screenshotDir: string;

beforeAll(async () => {
  server = fakeLinkedIn();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  screenshotDir = await mkdtemp(join(tmpdir(), "invytra-shots-"));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const sessionWith = (value: string): StorageState => ({
  cookies: [
    {
      name: "li_at",
      value,
      domain: "127.0.0.1",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ],
  origins: [],
});

interface Harness {
  deps: SessionManagerDeps;
  account: BrowserAccount;
  saved: Map<string, StorageState>;
  attention: { reason: string; screenshotPath: string | null }[];
  touched: string[];
}

let h: Harness;

function harness(initialSession: StorageState | null): Harness {
  const account: BrowserAccount = {
    id: "acc-1",
    label: "test-1",
    proxyUrl: "",
    timezone: "Asia/Kolkata",
    status: "ACTIVE",
  };
  const saved = new Map<string, StorageState>();
  if (initialSession) saved.set(account.id, initialSession);
  const attention: Harness["attention"] = [];
  const touched: string[] = [];
  return {
    account,
    saved,
    attention,
    touched,
    deps: {
      accounts: {
        get: async (id) => (id === account.id ? account : null),
        markNeedsAttention: async (_id, reason, screenshotPath) => {
          account.status = "NEEDS_ATTENTION";
          attention.push({ reason, screenshotPath });
        },
        touch: async (id) => void touched.push(id),
      },
      sessions: {
        load: async (id) => saved.get(id) ?? null,
        save: async (id, state) => void saved.set(id, state),
      },
      lock: new AccountLock(new FakeRedis()),
      baseUrl: "",
      screenshotDir: "",
      launch: { headless: true, allowNoProxy: true },
    },
  };
}

beforeEach(() => {
  h = harness(sessionWith("valid"));
  h.deps.baseUrl = baseUrl;
  h.deps.screenshotDir = screenshotDir;
});

const withSession = (value: string | null) => {
  h = harness(value === null ? null : sessionWith(value));
  h.deps.baseUrl = baseUrl;
  h.deps.screenshotDir = screenshotDir;
};

describe("withAccountSession", { timeout: 60_000 }, () => {
  it("restores a valid session, runs the task and re-saves the session", async () => {
    const result = await withAccountSession(
      h.account.id,
      async ({ page, baseUrl: base }) => {
        await page.goto(`${base}/in/someone/`);
        return {
          title: await page.title(),
          ua: await page.evaluate(() => navigator.userAgent),
          tz: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
        };
      },
      h.deps,
    );
    expect(result.title).toBe("Someone | LinkedIn");
    expect(result.ua).not.toContain("Headless");
    expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(result.tz); // same zone, two names
    const cookies = h.saved.get(h.account.id)!.cookies.map((c) => c.name);
    expect(cookies).toEqual(expect.arrayContaining(["li_at", "lidc"]));
    expect(h.attention).toEqual([]);
    expect(h.touched).toEqual([h.account.id]);
  });

  it("refuses to start without a saved session", async () => {
    withSession(null);
    await expect(withAccountSession(h.account.id, async () => 1, h.deps)).rejects.toBeInstanceOf(
      SessionRequiredError,
    );
    expect(h.attention[0]?.reason).toBe("NO_SESSION");
  });

  it.each([
    ["expired", "LOGGED_OUT"],
    ["flagged", "CHECKPOINT"],
    ["restricted", "RESTRICTED"],
    ["captcha", "CAPTCHA"],
  ])("stops the account when the session is %s", async (cookie, expected) => {
    withSession(cookie);
    let taskRan = false;
    const err = await withAccountSession(h.account.id, async () => (taskRan = true), h.deps).catch((e) => e);
    expect(err).toBeInstanceOf(AccountNeedsAttentionError);
    expect(err.pageState).toBe(expected);
    expect(taskRan).toBe(false);
    expect(h.account.status).toBe("NEEDS_ATTENTION");
    expect(h.attention[0]?.reason).toBe(expected);
    expect(h.attention[0]?.screenshotPath && existsSync(h.attention[0].screenshotPath)).toBe(true);
    // Session is NOT overwritten with a broken one
    expect(h.saved.get(h.account.id)!.cookies[0]!.value).toBe(cookie);
  });

  it("detects a checkpoint that appears in the middle of a task", async () => {
    const err = await withAccountSession(
      h.account.id,
      async ({ page, baseUrl: base }) => {
        await page.goto(`${base}/checkpoint/challenge/xyz`);
        throw new Error("Connect button not found");
      },
      h.deps,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AccountNeedsAttentionError);
    expect(err.pageState).toBe("CHECKPOINT");
  });

  it("rethrows ordinary task errors without stopping the account", async () => {
    await expect(
      withAccountSession(h.account.id, async () => Promise.reject(new Error("boom")), h.deps),
    ).rejects.toThrow("boom");
    expect(h.account.status).toBe("ACTIVE");
  });

  it("blocks a second session on the same account while one is running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = withAccountSession(h.account.id, () => gate, h.deps);
    await new Promise((r) => setTimeout(r, 300));
    await expect(withAccountSession(h.account.id, async () => 1, h.deps)).rejects.toBeInstanceOf(
      AccountBusyError,
    );
    release();
    await first;
    // and the lock is released afterwards
    await expect(withAccountSession(h.account.id, async () => "again", h.deps)).resolves.toBe("again");
  });

  it("refuses accounts that are not ACTIVE", async () => {
    h.account.status = "PAUSED";
    await expect(withAccountSession(h.account.id, async () => 1, h.deps)).rejects.toBeInstanceOf(
      AccountUnavailableError,
    );
  });

  it("refuses an account without a proxy unless dev mode allows it", async () => {
    h.deps.launch.allowNoProxy = false;
    await expect(withAccountSession(h.account.id, async () => 1, h.deps)).rejects.toThrow(/no proxy/);
  });
});
