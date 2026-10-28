import type { Page } from "playwright";
import { readProfile, topCard } from "./profile.js";
import { SELECTORS } from "./selectors.js";

export interface OwnPhoto {
  /** Base64 image bytes (kept small; stored in the database, never logged). */
  base64: string;
  type: string;
}

export interface OwnAccount {
  /** Premium badge → true; "Try Premium" style upsell → false; otherwise unknown (null). */
  premium: boolean | null;
  /** Their profile photo, or null if they have none (or it couldn't be read). */
  photo: OwnPhoto | null;
}

const MAX_PHOTO_BYTES = 300_000;

/**
 * Reads the logged-in member's own profile: Premium or free, and their profile photo.
 * Opens their own profile. Selectors UNVERIFIED on the real 2026 layout.
 */
export async function readOwnAccount(page: Page, baseUrl: string): Promise<OwnAccount> {
  await page.goto(new URL("/in/me/", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const p = await readProfile(page);
  let premium: boolean | null = null;
  if (p.premium) premium = true;
  else {
    const text = (await page.evaluate(() => document.body?.innerText ?? "")).toLowerCase();
    // Neither a badge nor an upsell: don't guess.
    if (SELECTORS.account.freeMarkers.some((m) => text.includes(m))) premium = false;
  }
  return { premium, photo: await readOwnPhoto(page).catch(() => null) };
}

/** Kept for older callers: just the plan. */
export async function readOwnPremium(page: Page, baseUrl: string): Promise<boolean | null> {
  return (await readOwnAccount(page, baseUrl)).premium;
}

/** The photo on the open profile's card, downloaded through the same browser (and proxy). */
async function readOwnPhoto(page: Page): Promise<OwnPhoto | null> {
  const img = topCard(page).locator(SELECTORS.profile.photo).first();
  if ((await img.count()) === 0) return null;
  const src = await img.getAttribute("src");
  if (!src || src.startsWith("data:") || SELECTORS.profile.noPhoto.test(src)) return null;
  const res = await page.request.get(new URL(src, page.url()).toString(), { timeout: 15_000 });
  if (!res.ok()) return null;
  const type = (res.headers()["content-type"] ?? "").split(";")[0]!.trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
  const body = await res.body();
  if (body.length === 0 || body.length > MAX_PHOTO_BYTES) return null;
  return { base64: body.toString("base64"), type };
}
