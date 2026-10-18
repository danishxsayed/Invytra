/**
 * Manual first login for an account: opens a visible browser through the
 * account's proxy; a team member logs in by hand (including 2FA); the session
 * is then encrypted and saved. Invytra never types passwords itself.
 *
 *   pnpm account:login <label>
 */
import { contextOptionsFor, launchBrowser, realUserAgent } from "../browser/launch.js";
import { redactProxyUrl } from "../browser/proxy.js";
import { createRuntime } from "../runtime.js";

const LOGIN_TIMEOUT_MS = 10 * 60_000;

async function main() {
  const label = process.argv[2];
  if (!label) throw new Error("Usage: pnpm account:login <account-label>");

  const rt = await createRuntime();
  try {
    const account = await rt.findAccount(label);
    console.log(`Account: ${account.label}`);
    console.log(`Proxy:   ${account.proxyUrl ? redactProxyUrl(account.proxyUrl) : "NONE (dev only)"}`);

    const browser = await launchBrowser(account, { headless: false, allowNoProxy: rt.env.ALLOW_NO_PROXY });
    try {
      const ua = await realUserAgent(browser);
      const context = await browser.newContext(contextOptionsFor(account, ua));
      const page = await context.newPage();
      await page.goto(new URL("/login", rt.env.LINKEDIN_BASE_URL).toString());

      console.log("\nLog in to LinkedIn in the browser window (including any 2FA or verification).");
      console.log("Waiting up to 10 minutes for the LinkedIn feed to appear…\n");
      await page.waitForURL((url) => url.pathname.startsWith("/feed"), { timeout: LOGIN_TIMEOUT_MS });
      await page.waitForTimeout(3000); // let cookies settle

      await rt.deps.sessions.save(account.id, await context.storageState());
      await rt.prisma.linkedinAccount.update({
        where: { id: account.id },
        data: { status: "ACTIVE", statusReason: null },
      });
      console.log(`✔ Session saved (encrypted) for "${account.label}". The account is ACTIVE.`);
    } finally {
      await browser.close();
    }
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
