/**
 * Cancel queued actions before the worker runs them. An action that is already
 * running finishes (or fails) normally.
 *
 *   pnpm queue:cancel <label>                       # everything queued for this account
 *   pnpm queue:cancel <label> invite|message|visit|status|inbox
 */
import type { ActionType } from "@invytra/shared";
import { createRuntime } from "../runtime.js";

const TYPES: Record<string, ActionType> = {
  visit: "PROFILE_VISIT",
  status: "CHECK_CONNECTION",
  invite: "CONNECTION_REQUEST",
  message: "MESSAGE",
  inbox: "INBOX_SYNC",
};

async function main() {
  const [label, kind] = process.argv.slice(2);
  if (!label) throw new Error("Usage: pnpm queue:cancel <label> [invite|message|visit|status|inbox]");
  if (kind && !TYPES[kind]) throw new Error(`Unknown type "${kind}" — use invite, message, visit, status or inbox`);
  const rt = await createRuntime();
  try {
    const account = await rt.findAccount(label);
    // The worker only runs rows that are still QUEUED, so this is enough to stop them.
    const res = await rt.prisma.action.updateMany({
      where: { accountId: account.id, status: "QUEUED", ...(kind ? { type: TYPES[kind] } : {}) },
      data: { status: "SKIPPED", error: "CANCELLED", executedAt: new Date() },
    });
    const running = await rt.prisma.action.count({ where: { accountId: account.id, status: "RUNNING" } });
    console.log(`✔ Cancelled ${res.count} queued ${kind ?? "action"}${res.count === 1 ? "" : "s"} for "${label}"`);
    if (running) console.log(`  ${running} action is running right now and will finish — it can't be stopped midway.`);
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
