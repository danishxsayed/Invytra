import type { Page } from "playwright";
import { readProfile } from "./profile.js";
import { SELECTORS } from "./selectors.js";

/**
 * Whether the logged-in member has LinkedIn Premium: their own profile shows the Premium
 * badge (→ true); a "Try Premium" style upsell means a free account (→ false); otherwise
 * unknown (null), and the user can set it in the account's settings. Opens their own profile. Selectors UNVERIFIED on the real 2026 layout.
 */
export async function readOwnPremium(page: Page, baseUrl: string): Promise<boolean | null> {
  await page.goto(new URL("/in/me/", baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const p = await readProfile(page);
  if (p.premium) return true;
  const text = (await page.evaluate(() => document.body?.innerText ?? "")).toLowerCase();
  if (SELECTORS.account.freeMarkers.some((m) => text.includes(m))) return false;
  // Neither a badge nor an upsell: don't guess (a wrong "free" would drop invite notes).
  return null;
}
