import { CAPTCHA_SELECTORS, TEXT_MARKERS, URL_MARKERS } from "../linkedin/selectors.js";

/**
 * What kind of page LinkedIn is showing. Anything other than OK stops the
 * account (CLAUDE.md rule 7) — the worker never tries to get past these itself.
 */
export type PageState = "OK" | "LOGGED_OUT" | "CHECKPOINT" | "CAPTCHA" | "RESTRICTED";

export interface PageSnapshot {
  url: string;
  title: string;
  /** Visible text of the page, any length — only the start is inspected. */
  bodyText: string;
  hasCaptchaElement: boolean;
}

export function detectPageState(snap: PageSnapshot): PageState {
  const path = safePath(snap.url);
  const text = `${snap.title}\n${snap.bodyText.slice(0, 8000)}`.toLowerCase();

  if (TEXT_MARKERS.restricted.some((m) => text.includes(m))) return "RESTRICTED";
  // Checkpoint URLs win over captcha text: LinkedIn titles them "Security Verification".
  if (path.includes(URL_MARKERS.checkpoint)) return "CHECKPOINT";
  if (snap.hasCaptchaElement || TEXT_MARKERS.captcha.some((m) => text.includes(m))) return "CAPTCHA";
  if (
    path.startsWith(URL_MARKERS.login) ||
    path.startsWith(URL_MARKERS.uasLogin) ||
    path.startsWith(URL_MARKERS.authwall) ||
    path.startsWith(URL_MARKERS.signup)
  ) {
    return "LOGGED_OUT";
  }
  return "OK";
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

/** Minimal slice of a Playwright Page, so this module stays easy to test. */
export interface InspectablePage {
  url(): string;
  title(): Promise<string>;
  evaluate<R>(fn: () => R): Promise<R>;
  locator(selector: string): { filter(opts: { visible: boolean }): { count(): Promise<number> } };
}

export async function snapshotPage(page: InspectablePage): Promise<PageSnapshot> {
  const [title, bodyText, captchaCounts] = await Promise.all([
    page.title().catch(() => ""),
    page.evaluate(() => document.body?.innerText ?? "").catch(() => ""),
    // Only VISIBLE captcha widgets count: LinkedIn loads hidden anti-bot iframes on normal pages.
    Promise.all(CAPTCHA_SELECTORS.map((s) => page.locator(s).filter({ visible: true }).count().catch(() => 0))),
  ]);
  return { url: page.url(), title, bodyText, hasCaptchaElement: captchaCounts.some((c) => c > 0) };
}

export async function inspectPage(page: InspectablePage): Promise<PageState> {
  return detectPageState(await snapshotPage(page));
}
