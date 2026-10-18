import { createHash } from "node:crypto";
import { chromium, type Browser, type BrowserContextOptions } from "playwright";
import { parseProxyUrl } from "./proxy.js";
import type { BrowserAccount, StorageState } from "./types.js";

export interface LaunchOptions {
  headless: boolean;
  /** DEV ONLY — when false, an account without a proxy is refused. */
  allowNoProxy: boolean;
}

/** One browser per account session, routed through that account's own proxy. */
export async function launchBrowser(account: BrowserAccount, opts: LaunchOptions): Promise<Browser> {
  if (!account.proxyUrl && !opts.allowNoProxy) {
    throw new Error(
      `Account "${account.label}" has no proxy. Every account needs its own proxy (CLAUDE.md rule 2). ` +
        `For local development only, set ALLOW_NO_PROXY=true.`,
    );
  }
  return chromium.launch({
    headless: opts.headless,
    ...(account.proxyUrl && { proxy: parseProxyUrl(account.proxyUrl) }),
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/**
 * Stable per-account fingerprint: the same account always gets the same
 * viewport, locale and time zone, so it looks like one person on one machine.
 */
export function contextOptionsFor(
  account: BrowserAccount,
  browserUserAgent: string,
  storageState?: StorageState,
): BrowserContextOptions {
  const hash = createHash("sha256").update(account.id).digest();
  const viewport = VIEWPORTS[hash[0]! % VIEWPORTS.length]!;
  return {
    viewport,
    locale: "en-US",
    timezoneId: account.timezone,
    userAgent: browserUserAgent.replace("HeadlessChrome", "Chrome"),
    ...(storageState && { storageState }),
  };
}

/** The browser's real user agent, read once from a throwaway page. */
export async function realUserAgent(browser: Browser): Promise<string> {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    return await page.evaluate(() => navigator.userAgent);
  } finally {
    await ctx.close();
  }
}
