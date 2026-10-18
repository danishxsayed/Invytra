import type { Locator, Page } from "playwright";
import { SELECTORS } from "./selectors.js";

export type ConnectionStatus = "CONNECTED" | "PENDING" | "NOT_CONNECTED" | "UNAVAILABLE";

export interface ProfileInfo {
  url: string;
  name: string;
  headline: string;
  status: ConnectionStatus;
}

/**
 * Accepts any LinkedIn profile URL (with or without www, query, trailing slash)
 * and returns the canonical /in/<slug>/ URL on the configured base URL.
 */
export function normalizeProfileUrl(input: string, baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`Not a valid URL: ${input}`);
  }
  const match = /^\/in\/([^/]+)/.exec(url.pathname);
  if (!match) throw new Error(`Not a LinkedIn profile URL (expected /in/<name>): ${input}`);
  return new URL(`/in/${match[1]}/`, baseUrl).toString();
}

/** The profile header card, in the 2026 layout or the older one. */
export function topCard(page: Page): Locator {
  return page.locator(SELECTORS.profile.topCard).or(page.locator(SELECTORS.profile.topCardFallback)).first();
}

const visible = (l: Locator) => l.filter({ visible: true });

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A clickable control (button OR link) inside the card, by accessible name. Visible only. */
export function control(card: Locator, name: RegExp): Locator {
  return visible(card.getByRole("button", { name })).or(visible(card.getByRole("link", { name })));
}

/** Reads name, headline and connection status from an open profile page. */
export async function readProfile(page: Page): Promise<ProfileInfo> {
  const card = topCard(page);
  if ((await card.count()) === 0) return { url: page.url(), name: "", headline: "", status: "UNAVAILABLE" };

  // One read of the card's text structure (no named helpers inside: this runs in the page).
  const raw = await card.evaluate((el, sel) => {
    const heading = el.querySelector(sel.name);
    const oldHeadline = el.querySelector(sel.headline);
    const paragraphs = Array.from(el.querySelectorAll("p")).map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim());
    return {
      name: (heading?.textContent ?? "").replace(/\s+/g, " ").trim(),
      oldHeadline: (oldHeadline?.textContent ?? "").replace(/\s+/g, " ").trim(),
      paragraphs,
      text: (el as HTMLElement).innerText ?? el.textContent ?? "",
    };
  }, { name: SELECTORS.profile.name, headline: SELECTORS.profile.headline });

  if (!raw.name) return { url: page.url(), name: "", headline: "", status: "UNAVAILABLE" };

  // 2026 layout: the headline is the first paragraph that isn't the degree ("· 2nd") or a separator.
  const headline =
    raw.oldHeadline || raw.paragraphs.find((t) => t && !t.startsWith("·") && !/^\d+$/.test(t)) || "";

  const pending = visible(card.getByLabel(SELECTORS.profile.pendingLabel)).or(
    control(card, SELECTORS.profile.pendingText),
  );

  let status: ConnectionStatus = "NOT_CONNECTED";
  if ((await pending.count()) > 0) status = "PENDING";
  else if (SELECTORS.profile.firstDegree.test(raw.text)) status = "CONNECTED";

  return { url: page.url(), name: raw.name, headline: headline.split("\n")[0]!, status };
}

/** The Connect control for THIS profile's person (checked against their name). */
export function connectControl(page: Page, name: string): Locator {
  const card = topCard(page);
  const forThisPerson = new RegExp(`^Invite ${escapeRegex(name)} to connect$`, "i");
  return visible(card.getByLabel(forThisPerson))
    .or(control(card, SELECTORS.profile.connectText))
    .or(visible(card.getByRole("menuitem", { name: forThisPerson })))
    .or(visible(card.getByRole("menuitem", { name: SELECTORS.profile.connectText })));
}

/** After opening "More": a Connect menu item for THIS person anywhere on the page (menus may render outside the card). */
export function connectMenuItem(page: Page, name: string): Locator {
  const forThisPerson = new RegExp(`^Invite ${escapeRegex(name)} to connect$`, "i");
  return visible(page.getByRole("menuitem", { name: forThisPerson }));
}
