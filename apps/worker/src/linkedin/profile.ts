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

export function topCard(page: Page): Locator {
  return page.locator(SELECTORS.profile.topCard).first();
}

const visible = (l: Locator) => l.filter({ visible: true });

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reads name, headline and connection status from an open profile page. */
export async function readProfile(page: Page): Promise<ProfileInfo> {
  const card = topCard(page);
  const nameEl = card.locator(SELECTORS.profile.name).first();
  if ((await card.count()) === 0 || (await nameEl.count()) === 0) {
    return { url: page.url(), name: "", headline: "", status: "UNAVAILABLE" };
  }
  const name = (await nameEl.innerText()).trim();
  const headline = ((await card.locator(SELECTORS.profile.headline).first().innerText().catch(() => "")) || "")
    .trim()
    .split("\n")[0]!;
  const cardText = await card.innerText();

  const pending = visible(card.getByRole("button", { name: SELECTORS.profile.pendingButton })).or(
    visible(card.getByRole("button", { name: SELECTORS.profile.pendingButtonText, exact: false })),
  );

  let status: ConnectionStatus = "NOT_CONNECTED";
  if ((await pending.count()) > 0) status = "PENDING";
  else if (SELECTORS.profile.firstDegree.test(cardText)) status = "CONNECTED";

  return { url: page.url(), name, headline, status };
}

/** The Connect control for THIS profile's person (checked against their name). */
export function connectControl(page: Page, name: string): Locator {
  const card = topCard(page);
  const forThisPerson = new RegExp(`^Invite ${escapeRegex(name)} to connect$`, "i");
  return visible(card.getByLabel(forThisPerson)).or(
    visible(card.getByRole("button", { name: SELECTORS.profile.connectButtonText })),
  );
}
