import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { AccountLock } from "./account-lock.js";
import {
  attachEvidence,
  type FailureEvidence,
  AccountBusyError,
  AccountNeedsAttentionError,
  AccountUnavailableError,
  SessionRequiredError,
} from "./errors.js";
import { contextOptionsFor, launchBrowser, realUserAgent, type LaunchOptions } from "./launch.js";
import { inspectPage } from "./page-state.js";
import { safeScreenshot } from "./screenshot.js";
import type { AccountRepository, SessionStore, SessionTaskContext } from "./types.js";

export interface SessionManagerDeps {
  accounts: AccountRepository;
  sessions: SessionStore;
  lock: AccountLock;
  baseUrl: string;
  screenshotDir: string;
  launch: LaunchOptions;
}

/**
 * Run `task` inside a logged-in LinkedIn session for one account.
 *
 * Guarantees:
 * - only one session per account at a time (Redis lock)
 * - the account's own proxy and stable fingerprint
 * - the saved session is restored, and re-saved after a successful task
 * - on any checkpoint / captcha / restriction / logout the account is stopped
 *   (NEEDS_ATTENTION) with a screenshot, and nothing else runs on it
 */
export async function withAccountSession<T>(
  accountId: string,
  task: (ctx: SessionTaskContext) => Promise<T>,
  deps: SessionManagerDeps,
): Promise<T> {
  const account = await deps.accounts.get(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.status !== "ACTIVE") throw new AccountUnavailableError(accountId, account.status);

  const token = await deps.lock.acquire(accountId);
  if (!token) throw new AccountBusyError(accountId);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  const stop = async (reason: string): Promise<never> => {
    const shot = page ? await screenshot(page, deps.screenshotDir, accountId, reason) : null;
    await deps.accounts.markNeedsAttention(accountId, reason, shot).catch(() => undefined);
    throw new AccountNeedsAttentionError(accountId, reason as never, shot);
  };

  const assertHealthy = async () => {
    if (!page) return;
    const state = await inspectPage(page);
    if (state !== "OK") await stop(state);
  };

  try {
    const saved = await deps.sessions.load(accountId);
    if (!saved) {
      await deps.accounts.markNeedsAttention(accountId, "NO_SESSION", null).catch(() => undefined);
      throw new SessionRequiredError(accountId);
    }

    browser = await launchBrowser(account, deps.launch);
    const ua = await realUserAgent(browser);
    context = await browser.newContext(contextOptionsFor(account, ua, saved));
    page = await context.newPage();

    await page.goto(new URL("/feed/", deps.baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await assertHealthy();

    let result: T;
    try {
      result = await task({ page, context, account, baseUrl: deps.baseUrl, assertHealthy });
    } catch (err) {
      // A task failure may be LinkedIn blocking us mid-task — check before rethrowing.
      if (!(err instanceof AccountNeedsAttentionError)) {
        await assertHealthy();
        throw attachEvidence(err, await captureEvidence(page, deps.screenshotDir, accountId));
      }
      throw err;
    }

    await deps.sessions.save(accountId, await context.storageState());
    await deps.accounts.touch(accountId).catch(() => undefined);
    return result;
  } finally {
    await browser?.close().catch(() => undefined);
    await deps.lock.release(accountId, token).catch(() => undefined);
  }
}

async function screenshot(page: Page, dir: string, accountId: string, reason: string): Promise<string | null> {
  const file = join(dir, `${accountId}-${reason}-${Date.now()}.png`);
  return (await safeScreenshot(page, file)) ? file : null;
}

/**
 * Saves what the page looked like when a task failed: screenshot, URL, the
 * accessibility tree of <main>, and the HTML of any open dialog/menu.
 * Never throws.
 */
async function captureEvidence(page: Page, dir: string, accountId: string): Promise<FailureEvidence> {
  const evidenceDir = join(dir, `failure-${accountId}-${Date.now()}`);
  try {
    await mkdir(evidenceDir, { recursive: true });
    const shot = join(evidenceDir, "page.png");
    const ok = await safeScreenshot(page, shot);
    const write = async (name: string, produce: () => Promise<string>) => {
      try {
        await writeFile(join(evidenceDir, name), await produce());
      } catch (e) {
        await writeFile(join(evidenceDir, name), `ERROR: ${e instanceof Error ? e.message : e}`).catch(() => undefined);
      }
    };
    await write("url.txt", async () => page.url());
    await write("main.aria.yml", () => page.locator("main").first().ariaSnapshot({ timeout: 8000 }));
    await write("body.aria.yml", () => page.locator("body").ariaSnapshot({ timeout: 8000 }));
    await write("overlays.html", () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, [role="menu"], [aria-modal="true"]'),
        )
          .map((el) => el.outerHTML.slice(0, 20000))
          .join("\n\n<!-- next -->\n\n") || "(no dialogs or menus in the page)",
      ),
    );
    return { screenshotPath: ok ? shot : null, evidenceDir };
  } catch {
    return { screenshotPath: null, evidenceDir: null };
  }
}
