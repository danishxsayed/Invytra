/**
 * Run one LinkedIn action for a test account, with limits and logging.
 *
 *   pnpm linkedin <label> visit   <profile-url>
 *   pnpm linkedin <label> status  <profile-url>
 *   pnpm linkedin <label> invite  <profile-url> ["optional note"]
 *   pnpm linkedin <label> message <profile-url> "message text"
 *   pnpm linkedin <label> inbox
 *   pnpm linkedin <label> usage
 */
import type { ActionType } from "@invytra/shared";
import { DEFAULT_LIMITS, limitsSchema } from "@invytra/shared";
import { runAction, usageFor, type RunActionResult } from "../actions/run-action.js";
import type { SessionTaskContext } from "../browser/types.js";
import {
  checkConnectionStatus,
  fetchInbox,
  sendConnectionRequest,
  sendMessage,
  visitProfile,
  type ActionOutcome,
} from "../linkedin/actions.js";
import { createRuntime } from "../runtime.js";

const USAGE = `Usage:
  pnpm linkedin <label> visit   <profile-url>
  pnpm linkedin <label> status  <profile-url>
  pnpm linkedin <label> invite  <profile-url> ["optional note"]
  pnpm linkedin <label> message <profile-url> "message text"
  pnpm linkedin <label> inbox
  pnpm linkedin <label> usage`;

async function main() {
  const [label, command, url, text] = process.argv.slice(2);
  if (!label || !command) throw new Error(USAGE);

  const rt = await createRuntime();
  try {
    const account = await rt.findAccount(label);

    if (command === "usage") {
      const usage = await usageFor(rt.prisma, account.id);
      const limits = limitsSchema.safeParse(account.limits).data ?? DEFAULT_LIMITS;
      console.log(`Account "${label}" — ${account.status}${account.statusReason ? ` (${account.statusReason})` : ""}`);
      console.log(`  profile visits (24h):   ${usage.today.PROFILE_VISIT} / ${limits.profileVisitsPerDay}`);
      console.log(`  invites (24h):          ${usage.today.CONNECTION_REQUEST} / ${limits.connectionRequestsPerDay}`);
      console.log(`  invites (7 days):       ${usage.connectionRequestsThisWeek} / ${limits.connectionRequestsPerWeek}`);
      console.log(`  messages (24h):         ${usage.today.MESSAGE} / ${limits.messagesPerDay}`);
      return;
    }

    const needUrl = () => {
      if (!url) throw new Error(USAGE);
      return url;
    };
    let type: ActionType;
    let work: (ctx: SessionTaskContext) => Promise<ActionOutcome<any>>;
    let payload: Record<string, unknown> = {};

    switch (command) {
      case "visit":
        type = "PROFILE_VISIT";
        work = (ctx) => visitProfile(ctx, needUrl());
        break;
      case "status":
        type = "CHECK_CONNECTION";
        work = (ctx) => checkConnectionStatus(ctx, needUrl());
        break;
      case "invite":
        type = "CONNECTION_REQUEST";
        payload = text ? { note: text } : {};
        work = (ctx) => sendConnectionRequest(ctx, needUrl(), text);
        break;
      case "message":
        if (!text) throw new Error(USAGE);
        type = "MESSAGE";
        payload = { text };
        work = (ctx) => sendMessage(ctx, needUrl(), text);
        break;
      case "inbox":
        type = "INBOX_SYNC";
        work = fetchInbox;
        break;
      default:
        throw new Error(`Unknown command "${command}".\n${USAGE}`);
    }
    if (command !== "inbox") needUrl();

    console.log(`→ ${command} as "${label}"…`);
    const result: RunActionResult<any> = await runAction(
      rt.prisma,
      rt.deps,
      {
        accountId: account.id,
        type,
        targetUrl: url,
        payload,
        ignoreWorkingHours: rt.env.IGNORE_WORKING_HOURS,
      },
      work,
    );

    if (result.status === "SUCCEEDED") {
      if (command === "inbox") {
        const threads = (result.data.threads ?? []) as { name: string; snippet: string; unread: boolean }[];
        console.log(`✔ ${threads.length} conversations read, ${result.data.newReplies ?? 0} new replies saved`);
        for (const t of threads.slice(0, 10)) {
          console.log(`  ${t.unread ? "●" : " "} ${t.name.padEnd(28).slice(0, 28)} ${t.snippet.slice(0, 70)}`);
        }
      } else {
        console.log(`✔ Done in ${(result.durationMs / 1000).toFixed(1)} s`, result.data);
      }
    } else if (result.status === "SKIPPED") {
      console.log(`– Skipped: ${result.reason}`, result.data ?? "");
      if (result.reason === "OUTSIDE_WORKING_HOURS") {
        console.log("  (For local testing only, set IGNORE_WORKING_HOURS=\"true\" in .env)");
      }
    } else {
      console.error(`✖ Failed: ${result.error}`);
      if (result.screenshotPath) console.error(`  Evidence saved: ${result.screenshotPath}`);
      process.exitCode = 1;
    }
  } finally {
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
