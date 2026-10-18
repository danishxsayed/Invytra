/**
 * Puts an account back to ACTIVE after a human has looked at why it stopped
 * (see the screenshot path printed here) and confirmed it is safe.
 *
 *   pnpm account:reactivate <label>
 */
import { createRuntime } from "../runtime.js";

async function main() {
  const label = process.argv[2];
  if (!label) throw new Error("Usage: pnpm account:reactivate <account-label>");
  const rt = await createRuntime();
  try {
    const account = await rt.findAccount(label);
    if (account.status === "ACTIVE") {
      console.log(`"${label}" is already ACTIVE.`);
      return;
    }
    console.log(`"${label}" was ${account.status}: ${account.statusReason ?? "(no reason recorded)"}`);
    if (!account.encryptedSession) {
      console.log(`It has no saved session — run: pnpm account:login ${label}`);
      process.exitCode = 1;
      return;
    }
    await rt.prisma.linkedinAccount.update({ where: { id: account.id }, data: { status: "ACTIVE", statusReason: null } });
    console.log(`✔ "${label}" is ACTIVE again. Run: pnpm account:check ${label}`);
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
