/**
 * Opens the saved session for an account headlessly, loads the feed and
 * reports whether LinkedIn still accepts it.
 *
 *   pnpm account:check <label>
 */
import { AccountNeedsAttentionError } from "../browser/errors.js";
import { withAccountSession } from "../browser/session-manager.js";
import { createRuntime } from "../runtime.js";

async function main() {
  const label = process.argv[2];
  if (!label) throw new Error("Usage: pnpm account:check <account-label>");

  const rt = await createRuntime();
  try {
    const account = await rt.findAccount(label);
    const started = Date.now();
    const url = await withAccountSession(account.id, async ({ page }) => page.url(), rt.deps);
    console.log(`✔ Session OK for "${label}" — loaded ${url} in ${Date.now() - started} ms`);
  } catch (err) {
    if (err instanceof AccountNeedsAttentionError) {
      console.error(`✖ LinkedIn showed ${err.pageState}. Account stopped (NEEDS_ATTENTION).`);
      if (err.screenshotPath) console.error(`  Screenshot: ${err.screenshotPath}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
