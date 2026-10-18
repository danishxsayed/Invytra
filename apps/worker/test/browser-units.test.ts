import { describe, expect, it } from "vitest";
import { AccountLock } from "../src/browser/account-lock.js";
import { contextOptionsFor } from "../src/browser/launch.js";
import { detectPageState, type PageSnapshot } from "../src/browser/page-state.js";
import { parseProxyUrl, redactProxyUrl } from "../src/browser/proxy.js";
import { readAccountsFromEnv } from "../src/config/accounts.js";
import { FakeRedis } from "./fake-redis.js";

const snap = (over: Partial<PageSnapshot>): PageSnapshot => ({
  url: "https://www.linkedin.com/feed/",
  title: "Feed | LinkedIn",
  bodyText: "Start a post",
  hasCaptchaElement: false,
  ...over,
});

describe("detectPageState", () => {
  it("treats the feed as OK", () => expect(detectPageState(snap({}))).toBe("OK"));
  it("treats profile pages as OK", () =>
    expect(detectPageState(snap({ url: "https://www.linkedin.com/in/someone/" }))).toBe("OK"));
  it("detects checkpoints", () =>
    expect(detectPageState(snap({ url: "https://www.linkedin.com/checkpoint/challenge/AgF" }))).toBe("CHECKPOINT"));
  it.each(["/login", "/uas/login?session_redirect=x", "/authwall?trk=x", "/signup/cold-join"])(
    "detects logged-out page %s",
    (path) => expect(detectPageState(snap({ url: `https://www.linkedin.com${path}` }))).toBe("LOGGED_OUT"),
  );
  it("detects captcha widgets", () => expect(detectPageState(snap({ hasCaptchaElement: true }))).toBe("CAPTCHA"));
  it("classifies a checkpoint titled Security Verification as CHECKPOINT", () =>
    expect(
      detectPageState(snap({ url: "https://www.linkedin.com/checkpoint/challenge/x", title: "Security Verification" })),
    ).toBe("CHECKPOINT"));
  it("detects captcha text", () =>
    expect(detectPageState(snap({ bodyText: "Let's do a quick security check" }))).toBe("CAPTCHA"));
  it("detects restrictions, even on a checkpoint URL", () =>
    expect(
      detectPageState(
        snap({ url: "https://www.linkedin.com/checkpoint/x", bodyText: "Your account has been restricted" }),
      ),
    ).toBe("RESTRICTED"));
  it("does not flag /feed URLs containing 'login' in the query", () =>
    expect(detectPageState(snap({ url: "https://www.linkedin.com/feed/?from=login" }))).toBe("OK"));
});

describe("proxy", () => {
  it("parses credentials", () =>
    expect(parseProxyUrl("http://us%40er:p%3Ass@1.2.3.4:8080")).toEqual({
      server: "http://1.2.3.4:8080",
      username: "us@er",
      password: "p:ss",
    }));
  it("parses a proxy without credentials", () =>
    expect(parseProxyUrl("socks5://proxy.local:1080")).toEqual({ server: "socks5://proxy.local:1080" }));
  it("rejects a missing port", () => expect(() => parseProxyUrl("http://1.2.3.4")).toThrow(/port/));
  it("rejects garbage", () => expect(() => parseProxyUrl("not a url")).toThrow(/not valid/));
  it("redacts credentials for logs", () => {
    const out = redactProxyUrl("http://user:secret@1.2.3.4:8080");
    expect(out).not.toContain("secret");
    expect(out).not.toContain("user");
  });
});

describe("AccountLock", () => {
  it("allows only one holder per account", async () => {
    const lock = new AccountLock(new FakeRedis());
    const a = await lock.acquire("acc1");
    expect(a).toBeTruthy();
    expect(await lock.acquire("acc1")).toBeNull();
    expect(await lock.acquire("acc2")).toBeTruthy();
  });
  it("can be re-acquired after release", async () => {
    const lock = new AccountLock(new FakeRedis());
    const a = (await lock.acquire("acc1"))!;
    await lock.release("acc1", a);
    expect(await lock.acquire("acc1")).toBeTruthy();
  });
  it("does not release a lock someone else now holds", async () => {
    const redis = new FakeRedis();
    const lock = new AccountLock(redis, 1000);
    let t = 0;
    redis.now = () => t;
    const first = (await lock.acquire("acc1"))!;
    t = 5000; // first lock expired
    const second = await lock.acquire("acc1");
    await lock.release("acc1", first);
    expect(second).toBeTruthy();
    expect(await lock.acquire("acc1")).toBeNull();
  });
});

describe("contextOptionsFor", () => {
  const account = { id: "acc-123", label: "t", proxyUrl: "", timezone: "Europe/London", status: "ACTIVE" as const };
  it("is stable for the same account", () => {
    const ua = "Mozilla/5.0 HeadlessChrome/141.0";
    expect(contextOptionsFor(account, ua)).toEqual(contextOptionsFor(account, ua));
  });
  it("uses the account time zone and hides the headless user agent", () => {
    const opts = contextOptionsFor(account, "Mozilla/5.0 HeadlessChrome/141.0");
    expect(opts.timezoneId).toBe("Europe/London");
    expect(opts.userAgent).toBe("Mozilla/5.0 Chrome/141.0");
  });
});

describe("readAccountsFromEnv", () => {
  it("reads numbered accounts and skips gaps", () => {
    const env = {
      ACCOUNT_1_LABEL: "test-1",
      ACCOUNT_1_PROXY_URL: "http://u:p@h:1",
      ACCOUNT_3_LABEL: "test-3",
      ACCOUNT_3_TIMEZONE: "America/New_York",
    };
    expect(readAccountsFromEnv(env)).toEqual([
      { label: "test-1", email: null, proxyUrl: "http://u:p@h:1", timezone: "Asia/Kolkata" },
      { label: "test-3", email: null, proxyUrl: "", timezone: "America/New_York" },
    ]);
  });
});
