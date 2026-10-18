import type { BrowserContext, Page } from "playwright";
import type { PageState } from "./page-state.js";

/** The account fields the browser layer needs. */
export interface BrowserAccount {
  id: string;
  label: string;
  proxyUrl: string;
  timezone: string;
  status: "ACTIVE" | "PAUSED" | "NEEDS_ATTENTION" | "DISCONNECTED";
}

/** Playwright storage state (cookies + localStorage) as returned by context.storageState(). */
export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export interface AccountRepository {
  get(accountId: string): Promise<BrowserAccount | null>;
  /** Stop the account and record why. Must never throw on purpose. */
  markNeedsAttention(accountId: string, reason: string, screenshotPath: string | null): Promise<void>;
  touch(accountId: string): Promise<void>;
}

/** Encrypted at rest by the implementation. */
export interface SessionStore {
  load(accountId: string): Promise<StorageState | null>;
  save(accountId: string, state: StorageState): Promise<void>;
}

export interface SessionTaskContext {
  page: Page;
  context: BrowserContext;
  account: BrowserAccount;
  baseUrl: string;
  /** Re-check the current page; throws AccountNeedsAttentionError if LinkedIn blocked us. */
  assertHealthy(): Promise<void>;
}

export type { PageState };
