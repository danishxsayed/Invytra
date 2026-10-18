/**
 * Captures what LinkedIn really shows this account, so selectors can be
 * checked against the live site. Read-only: it opens pages and the "More"
 * menu, then closes it. It never clicks Connect, Message or Send.
 *
 *   pnpm account:probe <label> <profile-url> [<profile-url> …]
 *
 * Output: .data/probe/<timestamp>/  (screenshots, accessibility trees, results)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { withAccountSession } from "../browser/session-manager.js";
import { humanPause } from "../linkedin/human.js";
import { normalizeProfileUrl, readProfile, topCard } from "../linkedin/profile.js";
import { SELECTORS } from "../linkedin/selectors.js";
import { createRuntime } from "../runtime.js";

async function main() {
  const [label, ...urls] = process.argv.slice(2);
  if (!label || urls.length === 0) throw new Error("Usage: pnpm account:probe <label> <profile-url> [...]");

  const rt = await createRuntime();
  const outDir = resolve(import.meta.dirname, "../../../..", rt.env.DATA_DIR, "probe", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(outDir, { recursive: true });
  try {
    const account = await rt.findAccount(label);
    await withAccountSession(
      account.id,
      async ({ page, baseUrl, assertHealthy }) => {
        let i = 0;
        for (const raw of urls) {
          i++;
          const url = normalizeProfileUrl(raw, baseUrl);
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await humanPause(page, 3000, 5000);
          await assertHealthy();
          const card = topCard(page);
          const info = await readProfile(page);
          await page.screenshot({ path: join(outDir, `profile-${i}.png`) });
          await writeFile(join(outDir, `profile-${i}-main.aria.yml`), await page.locator("main").first().ariaSnapshot().catch((e) => `ERR ${e}`));
          await writeFile(join(outDir, `profile-${i}-topcard.aria.yml`), await card.ariaSnapshot().catch((e) => `ERR ${e}`));
          await writeFile(join(outDir, `profile-${i}-topcard.html`), await card.evaluate((el) => el.outerHTML).catch((e) => `ERR ${e}`));

          let moreMenu = "No 'More actions' button found in top card";
          const more = card.getByRole("button", { name: SELECTORS.profile.moreButton }).first();
          if ((await more.count()) > 0) {
            await more.click();
            await humanPause(page, 800, 1500);
            moreMenu = await card.ariaSnapshot().catch((e) => `ERR ${e}`);
            await page.screenshot({ path: join(outDir, `profile-${i}-more-menu.png`) });
            await page.keyboard.press("Escape");
          }
          await writeFile(join(outDir, `profile-${i}-more-menu.aria.yml`), moreMenu);
          await writeFile(join(outDir, `profile-${i}-result.json`), JSON.stringify({ input: raw, ...info }, null, 2));
          console.log(`  ${i}. ${info.name || "(no name found)"} — detected status: ${info.status}`);
          await humanPause(page, 2000, 4000);
        }

        await page.goto(new URL(SELECTORS.inbox.path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await humanPause(page, 4000, 6000);
        await assertHealthy();
        await page.screenshot({ path: join(outDir, "messaging.png") });
        await writeFile(join(outDir, "messaging-main.aria.yml"), await page.locator("main").first().ariaSnapshot().catch((e) => `ERR ${e}`));
        const threadCount = await page.locator(SELECTORS.inbox.threadLink).count();
        await writeFile(join(outDir, "messaging-result.json"), JSON.stringify({ threadLinksFound: threadCount }, null, 2));
        console.log(`  messaging: ${threadCount} conversation links found`);
      },
      rt.deps,
    );
    console.log(`✔ Probe saved to ${outDir}`);
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
