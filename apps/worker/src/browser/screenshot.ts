import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "playwright";

/**
 * Best-effort screenshot. Playwright's page.screenshot waits for web fonts,
 * and LinkedIn keeps some font requests open forever, so it can hang. If the
 * normal screenshot doesn't finish quickly, capture directly through the
 * Chrome DevTools Protocol, which doesn't wait for fonts.
 */
export async function safeScreenshot(page: Page, path: string, timeoutMs = 8000): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  try {
    await page.screenshot({ path, timeout: timeoutMs, animations: "disabled", caret: "initial" });
    return true;
  } catch {
    // fall through to CDP
  }
  try {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path, Buffer.from(data, "base64"));
    await cdp.detach().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
