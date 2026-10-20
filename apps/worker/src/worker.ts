/**
 * The Invytra worker: runs queued LinkedIn actions one account at a time,
 * with limits, working hours and human-like gaps, and reads inboxes regularly.
 *
 *   pnpm worker
 */
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { redisPacingStore } from "./queue/pacing.js";
import { scheduleInboxSyncs } from "./queue/inbox-scheduler.js";
import { processAction } from "./queue/processor.js";
import { QUEUE_NAME, createQueue, scheduleAction, type ActionJob } from "./queue/queue.js";
import { createRuntime } from "./runtime.js";

const INBOX_EVERY_MIN = Number(process.env.INBOX_SYNC_EVERY_MINUTES ?? 60);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
/** Same knob as the human-pacing waits; never set below 1 against real LinkedIn. */
const GAP_SCALE = Math.max(0, Number(process.env.INVYTRA_PACE ?? "1"));

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const log = (msg: string) => console.log(`[${stamp()}] ${msg}`);

async function main() {
  const rt = await createRuntime();
  // BullMQ needs its own connection with maxRetriesPerRequest: null.
  const connection = new Redis(rt.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createQueue(connection);
  const pacing = redisPacingStore(rt.redis);

  // Recover from a crash: RUNNING rows go back to QUEUED, and every QUEUED row gets its job (idempotent).
  const stuck = await rt.prisma.action.updateMany({ where: { status: "RUNNING" }, data: { status: "QUEUED" } });
  const queued = await rt.prisma.action.findMany({ where: { status: "QUEUED" }, select: { id: true, scheduledAt: true } });
  for (const a of queued) await scheduleAction(queue, a.id, a.scheduledAt);
  log(`Worker started — ${queued.length} queued action(s)${stuck.count ? `, ${stuck.count} recovered from a crash` : ""}`);
  if (rt.env.IGNORE_WORKING_HOURS) log("⚠ IGNORE_WORKING_HOURS is on (dev only) — limits still apply");

  const labels = new Map<string, string>();
  const labelOf = async (accountId: string) => {
    if (!labels.has(accountId)) {
      const a = await rt.prisma.linkedinAccount.findUnique({ where: { id: accountId }, select: { label: true } });
      labels.set(accountId, a?.label ?? accountId);
    }
    return labels.get(accountId)!;
  };

  const worker = new Worker<ActionJob>(
    QUEUE_NAME,
    async (job) => {
      const action = await rt.prisma.action.findUnique({ where: { id: job.data.actionId } });
      const what = action ? `${await labelOf(action.accountId)} ${action.type}${action.targetUrl ? ` ${action.targetUrl}` : ""}` : job.data.actionId;
      const result = await processAction(
        { prisma: rt.prisma, session: rt.deps, pacing, ignoreWorkingHours: rt.env.IGNORE_WORKING_HOURS, gapScale: GAP_SCALE },
        job.data.actionId,
      );
      if (result.kind === "reschedule") {
        await scheduleAction(queue, job.data.actionId, result.runAt);
        // Waiting for the account's turn is routine — only log meaningful waits.
        if (!["WAITING_TURN", "PACING"].includes(result.reason)) {
          log(`… ${what} — ${result.reason}, next try ${result.runAt.toLocaleString("en-GB")}`);
        }
      } else if (result.kind === "done") {
        const icon = result.status === "SUCCEEDED" ? "✔" : result.status === "SKIPPED" ? "–" : "✖";
        log(`${icon} ${what} — ${result.status}${result.detail ? `: ${result.detail}` : ""}`);
      }
    },
    { connection, concurrency: CONCURRENCY },
  );
  worker.on("failed", (job, err) => log(`✖ job ${job?.id} crashed: ${err.message}`));

  const syncInboxes = async () => {
    try {
      const n = await scheduleInboxSyncs(rt.prisma, queue, INBOX_EVERY_MIN);
      if (n) log(`Queued inbox sync for ${n} account(s)`);
    } catch (e) {
      log(`Inbox scheduler error: ${e instanceof Error ? e.message : e}`);
    }
  };
  await syncInboxes();
  const timer = setInterval(syncInboxes, 10 * 60_000);

  const shutdown = async () => {
    log("Stopping… (finishing the current action)");
    clearInterval(timer);
    await worker.close();
    await queue.close();
    connection.disconnect();
    await rt.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
