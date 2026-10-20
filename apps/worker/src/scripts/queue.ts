/**
 * Add LinkedIn actions to the queue. The worker (`pnpm worker`) runs them with
 * working hours, limits and human-like gaps.
 *
 *   pnpm queue <label> visit   <url> [<url> …]
 *   pnpm queue <label> status  <url> [<url> …]
 *   pnpm queue <label> invite  <url> [<url> …] [--note "Hi {firstName}, …"]
 *   pnpm queue <label> message <url> [<url> …] --text "Hi {firstName}, …"
 *   pnpm queue <label> inbox
 *   pnpm queue <label> file    <invite|visit|status> <path-to-urls.txt> [--note "…"]
 *
 * {firstName} is filled in from the profile at send time.
 */
import type { ActionType } from "@invytra/shared";
import { CONNECTION_NOTE_MAX_CHARS } from "@invytra/shared";
import { readFile } from "node:fs/promises";
import { Redis } from "ioredis";
import { createQueue, enqueueAction } from "../queue/queue.js";
import { normalizeProfileUrl } from "../linkedin/profile.js";
import { createRuntime } from "../runtime.js";

const USAGE = `Usage:
  pnpm queue <label> visit   <url> [<url> …]
  pnpm queue <label> status  <url> [<url> …]
  pnpm queue <label> invite  <url> [<url> …] [--note "Hi {firstName}, …"]
  pnpm queue <label> message <url> [<url> …] --text "Hi {firstName}, …"
  pnpm queue <label> inbox
  pnpm queue <label> file    <invite|visit|status> <urls.txt> [--note "…"]`;

const TYPES: Record<string, ActionType> = {
  visit: "PROFILE_VISIT",
  status: "CHECK_CONNECTION",
  invite: "CONNECTION_REQUEST",
  message: "MESSAGE",
  inbox: "INBOX_SYNC",
};

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? "";
    else positional.push(a);
  }
  return { positional, flags };
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  let [label, command, ...rest] = positional;
  if (!label || !command) throw new Error(USAGE);

  let urls = rest;
  if (command === "file") {
    const [kind, path] = rest;
    if (!kind || !path || !["invite", "visit", "status"].includes(kind)) throw new Error(USAGE);
    command = kind;
    urls = (await readFile(path, "utf8"))
      .split(/\r?\n/)
      .map((l) => l.split(",")[0]!.trim())
      .filter((l) => l.includes("/in/"));
  }
  const type = TYPES[command];
  if (!type) throw new Error(`Unknown command "${command}".\n${USAGE}`);
  if (type !== "INBOX_SYNC" && urls.length === 0) throw new Error(`No profile URLs given.\n${USAGE}`);
  if (type === "MESSAGE" && !flags.text?.trim()) throw new Error(`message needs --text "…"\n${USAGE}`);
  // Templates are filled per person at send time; check the worst case length now.
  if (flags.note && flags.note.replace(/\{firstName\}/g, "X".repeat(20)).length > CONNECTION_NOTE_MAX_CHARS) {
    throw new Error(`--note is too long (LinkedIn allows ${CONNECTION_NOTE_MAX_CHARS} characters)`);
  }

  const rt = await createRuntime();
  const connection = new Redis(rt.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createQueue(connection);
  try {
    const account = await rt.findAccount(label);
    const payload: Record<string, unknown> = {};
    if (flags.note) payload.note = flags.note;
    if (flags.text) payload.text = flags.text;

    if (type === "INBOX_SYNC") {
      await enqueueAction(rt.prisma, queue, { accountId: account.id, type });
      console.log(`✔ Queued inbox sync for "${label}"`);
    } else {
      const unique = [...new Set(urls.map((u) => normalizeProfileUrl(u, "https://www.linkedin.com")))];
      for (const url of unique) await enqueueAction(rt.prisma, queue, { accountId: account.id, type, targetUrl: url, payload });
      console.log(`✔ Queued ${unique.length} ${command}${unique.length === 1 ? "" : "s"} for "${label}"`);
    }
    console.log("  Make sure the worker is running:  pnpm worker");
  } finally {
    await queue.close();
    connection.disconnect();
    await rt.close();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
