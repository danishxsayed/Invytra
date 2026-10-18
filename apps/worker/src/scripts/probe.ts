/**
 * Captures what LinkedIn really shows this account, so selectors can be
 * checked against the live site. Read-only: it opens pages and the "More"
 * menu, then closes it. It never clicks Connect, Message or Send.
 *
 *   pnpm account:probe <label> <profile-url> [<profile-url> …]
 *
 * Output: .data/probe/<timestamp>/  (accessibility trees, HTML, results, screenshots)
 * Each capture is independent — one failure is noted and the rest continue.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { safeScreenshot } from "../browser/screenshot.js";
import { withAccountSession } from "../browser/session-manager.js";
import { humanPause } from "../linkedin/human.js";
import { control, normalizeProfileUrl, readProfile, topCard } from "../linkedin/profile.js";
import { SELECTORS } from "../linkedin/selectors.js";
import { createRuntime } from "../runtime.js";

const errText = (e: unknown) => `ERROR: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;

async function main() {
  const [label, ...urls] = process.argv.slice(2);
  if (!label || urls.length === 0) throw new Error("Usage: pnpm account:probe <label> <profile-url> [...]");

  const rt = await createRuntime();
  const outDir = resolve(
    import.meta.dirname,
    "../../../..",
    rt.env.DATA_DIR,
    "probe",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(outDir, { recursive: true });
  const save = async (name: string, produce: () => Promise<string>) => {
    let content: string;
    try {
      content = await produce();
    } catch (e) {
      content = errText(e);
    }
    await writeFile(join(outDir, name), content);
  };
  const log: string[] = [];

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
          await humanPause(page, 4000, 6000);
          await assertHealthy();
          const card = topCard(page);

          await save(`profile-${i}-result.json`, async () => JSON.stringify({ input: raw, ...(await readProfile(page)) }, null, 2));
          await save(`profile-${i}-topcard.aria.yml`, () => card.ariaSnapshot({ timeout: 10_000 }));
          await save(`profile-${i}-topcard.html`, () => card.evaluate((el) => el.outerHTML, undefined, { timeout: 10_000 }));
          await save(`profile-${i}-main.aria.yml`, () => page.locator("main").first().ariaSnapshot({ timeout: 10_000 }));
          await save(`profile-${i}-buttons.json`, async () =>
            JSON.stringify(
              await page.evaluate(() =>
                Array.from(document.querySelectorAll("main button, main [role=button], main a[aria-label]"))
                  .slice(0, 80)
                  .map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    aria: el.getAttribute("aria-label"),
                    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
                    visible: (el as HTMLElement).offsetParent !== null,
                  })),
              ),
              null,
              2,
            ),
          );
          const shot = await safeScreenshot(page, join(outDir, `profile-${i}.png`));

          await save(`profile-${i}-more-menu.aria.yml`, async () => {
            const more = control(card, SELECTORS.profile.moreButton).first();
            if ((await more.count()) === 0) return "No 'More actions' button found in top card";
            await more.click({ timeout: 10_000 });
            await humanPause(page, 1000, 1800);
            const snap = await page.locator("main").first().ariaSnapshot({ timeout: 10_000 });
            await safeScreenshot(page, join(outDir, `profile-${i}-more-menu.png`));
            await page.keyboard.press("Escape");
            return snap;
          });

          const info = JSON.parse(
            await import("node:fs/promises").then((fs) => fs.readFile(join(outDir, `profile-${i}-result.json`), "utf8")).catch(() => "{}"),
          );
          const line = `  ${i}. ${info.name || "(no name found)"} — detected status: ${info.status ?? "?"}${shot ? "" : " (screenshot failed)"}`;
          console.log(line);
          log.push(line);
          await humanPause(page, 2000, 4000);
        }

        await page.goto(new URL(SELECTORS.inbox.path, baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await humanPause(page, 5000, 7000);
        // Save first, check health after — so a stop still leaves evidence behind.
        await save("messaging-main.aria.yml", () => page.locator("main").first().ariaSnapshot({ timeout: 10_000 }));
        await save("messaging-list.html", () =>
          page
            .getByRole("list", { name: SELECTORS.inbox.conversationList })
            .first()
            .locator(":scope > li")
            .evaluateAll((items) => items.slice(0, 3).map((li) => li.outerHTML).join("\n\n<!-- next -->\n\n"), undefined),
        );
        const threadCount = await page
          .getByRole("list", { name: SELECTORS.inbox.conversationList })
          .first()
          .locator(":scope > li")
          .count()
          .catch(() => -1);
        await writeFile(join(outDir, "messaging-result.json"), JSON.stringify({ conversationsFound: threadCount }, null, 2));
        await safeScreenshot(page, join(outDir, "messaging.png"));
        console.log(`  messaging: ${threadCount} conversations found`);
        await assertHealthy();
      },
      rt.deps,
    );
    console.log(`✔ Probe saved to ${outDir}`);
  } catch (e) {
    await writeFile(join(outDir, "error.txt"), `${errText(e)}\n\n${log.join("\n")}`).catch(() => undefined);
    throw e;
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
