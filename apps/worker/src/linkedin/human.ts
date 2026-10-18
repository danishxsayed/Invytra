import type { Locator, Page } from "playwright";

export type Random = () => number;

/**
 * Multiplier for every human-like wait. 1 in production; tests set
 * INVYTRA_PACE=0.02 so they finish quickly. Never lower it against LinkedIn.
 */
const PACE = Math.max(0, Number(process.env.INVYTRA_PACE ?? "1")) || (process.env.INVYTRA_PACE === "0" ? 0 : 1);

export function randomBetween(min: number, max: number, random: Random = Math.random): number {
  return Math.round(min + random() * (max - min));
}

/** Wait a human-looking amount of time. */
export async function humanPause(page: Page, minMs = 800, maxMs = 2500): Promise<void> {
  await page.waitForTimeout(randomBetween(minMs, maxMs) * PACE);
}

/** Click with a short hover first, like a person moving the mouse. */
export async function humanClick(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  await humanPause(page, 150, 600);
  await target.click();
}

/** Type character by character with uneven delays. */
export async function humanType(page: Page, target: Locator, text: string): Promise<void> {
  await target.click();
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout((randomBetween(35, 140) + (ch === " " ? randomBetween(0, 120) : 0)) * PACE);
  }
}

/** Scroll down and back a little, the way people glance at a profile. */
export async function humanBrowse(page: Page): Promise<void> {
  const steps = randomBetween(2, 4);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, randomBetween(250, 650));
    await humanPause(page, 600, 1800);
  }
  await page.mouse.wheel(0, -randomBetween(400, 1200));
  await humanPause(page, 400, 1200);
}
