/**
 * The Invytra worker: runs queued LinkedIn actions one account at a time,
 * with limits, working hours and human-like gaps, and reads inboxes regularly.
 *
 *   pnpm worker
 */
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { redisPacingStore } from "./queue/pacing.js";
import { ensureInboxSync, scheduleInboxSyncs } from "./queue/inbox-scheduler.js";
import { processAction } from "./queue/processor.js";
import { QUEUE_NAME, createQueue, scheduleAction, type ActionJob } from "./queue/queue.js";
import { createConnectServer } from "./connect/server.js";
import { campaignTick } from "./campaigns/engine.js";
import { importTick } from "./imports/importer.js";
import { warmupTick } from "./email/warmup.js";
import { emailCampaignTick } from "./email/campaigns.js";
import { emailReplyTick } from "./email/replies.js";
import { verifyTick } from "./email/verify.js";
import { createRuntime } from "./runtime.js";
import { unipileFromEnv } from "@invytra/db";

const INBOX_EVERY_MIN = Number(process.env.INBOX_SYNC_EVERY_MINUTES ?? 20);
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
  const unipile = unipileFromEnv();
  if (unipile) log("Unipile is set up: accounts connected through Unipile run through its API");

  // Recover from a crash: RUNNING rows go back to QUEUED, and every QUEUED row gets its job (idempotent).
  // A reply cut off mid-send may have gone out: never send it twice, let the person check.
  await rt.prisma.action.updateMany({
    where: { status: "RUNNING", type: "REPLY" },
    data: { status: "FAILED", error: "Interrupted while sending. Check the conversation on LinkedIn before sending again.", executedAt: new Date() },
  });
  const stuck = await rt.prisma.action.updateMany({ where: { status: "RUNNING" }, data: { status: "QUEUED" } });
  // Search pages of accounts through Unipile run around the clock: ones put off until working hours go now.
  await rt.prisma.action.updateMany({
    where: { status: "QUEUED", type: "SEARCH_PAGE", error: "waiting: OUTSIDE_WORKING_HOURS", account: { engine: "UNIPILE" } },
    data: { scheduledAt: new Date(), error: null },
  });
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
        { prisma: rt.prisma, session: rt.deps, pacing, ignoreWorkingHours: rt.env.IGNORE_WORKING_HOURS, gapScale: GAP_SCALE, unipile },
        job.data.actionId,
      );
      if (result.kind === "reschedule") {
        await scheduleAction(queue, job.data.actionId, result.runAt);
        // A campaign message waits for a fresh look at the inbox (stop on reply).
        if (result.reason === "WAITING_INBOX_CHECK" && action) await ensureInboxSync(rt.prisma, queue, action.accountId);
        // Waiting for the account's turn is routine — only log meaningful waits.
        if (!["WAITING_TURN", "PACING", "WAITING_INBOX_CHECK"].includes(result.reason)) {
          log(`… ${what} — ${result.reason}, next try ${result.runAt.toLocaleString("en-GB")}`);
        }
      } else if (result.kind === "done") {
        const icon = result.status === "SUCCEEDED" ? "✔" : result.status === "SKIPPED" ? "–" : "✖";
        log(`${icon} ${what} — ${result.status}${result.detail ? `: ${result.detail}` : ""}`);
        // A search page finished: add its people and queue the next page now, not at the next tick.
        if (action?.type === "SEARCH_PAGE") {
          try {
            const imp = await importTick({ prisma: rt.prisma, queue });
            if (imp.added || imp.finished) log(`Imports: ${imp.added} new lead(s) added${imp.finished ? `, ${imp.finished} import(s) finished` : ""}`);
          } catch (e) {
            log(`Import error: ${e instanceof Error ? e.message : e}`);
          }
        }
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

  // Campaigns: move each lead to its next step (only queues — limits and pacing still apply).
  let ticking = false;
  const runCampaigns = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const imp = await importTick({ prisma: rt.prisma, queue });
      if (imp.added || imp.finished) log(`Imports: ${imp.added} new lead(s) added${imp.finished ? `, ${imp.finished} import(s) finished` : ""}`);
      const t = await campaignTick({ prisma: rt.prisma, queue });
      if (t.queued || t.replied || t.cancelled) {
        log(`Campaigns: ${t.queued} step(s) queued${t.replied ? `, ${t.replied} lead(s) replied — follow-ups stopped` : ""}${t.cancelled ? `, ${t.cancelled} cancelled (paused)` : ""}`);
      }
    } catch (e) {
      log(`Campaign engine error: ${e instanceof Error ? e.message : e}`);
    } finally {
      ticking = false;
    }
  };
  await runCampaigns();
  const campaignTimer = setInterval(runCampaigns, Number(process.env.CAMPAIGN_TICK_SECONDS ?? 60) * 1000);

  // Email Outreach, every minute: campaign emails, then replies/bounces, then warm-up.
  let warming = false;
  const runWarmup = async () => {
    if (warming) return;
    warming = true;
    try {
      const key = rt.env.SESSION_ENCRYPTION_KEY;
      const c = await emailCampaignTick({ prisma: rt.prisma, key });
      if (c.started) log(`Email campaigns: ${c.started} scheduled campaign(s) started`);
      if (c.sent || c.bounced || c.skipped || c.failed || c.completed) {
        log(`Email campaigns: ${c.sent} sent${c.bounced ? `, ${c.bounced} bounced` : ""}${c.skipped ? `, ${c.skipped} skipped` : ""}${c.failed ? `, ${c.failed} failed` : ""}${c.completed ? `, ${c.completed} campaign(s) finished` : ""}`);
      }
      const r = await emailReplyTick({ prisma: rt.prisma, key });
      if (r.replies || r.bounces || r.autoReplies) log(`Email inbox: ${r.replies} repl${r.replies === 1 ? "y" : "ies"}, ${r.autoReplies} auto-repl${r.autoReplies === 1 ? "y" : "ies"}, ${r.bounces} bounce(s)${r.fromSpam ? ` (${r.fromSpam} found in spam, moved to the inbox)` : ""}`);
      const v = await verifyTick({ prisma: rt.prisma });
      if (v.checked || v.error) log(`Email verification: ${v.checked} checked${v.waiting ? `, ${v.waiting} waiting` : ""}${v.error ? ` (stopped: ${v.error})` : ""}`);
      const w = await warmupTick({ prisma: rt.prisma, key });
      if (w.sent || w.checked || w.failed) {
        log(`Email warm-up: ${w.sent} sent, ${w.checked} checked${w.spam ? ` (${w.spam} rescued from spam)` : ""}, ${w.replied} replied${w.failed ? `, ${w.failed} failed` : ""}`);
      }
    } catch (e) {
      log(`Email engine error: ${e instanceof Error ? e.message : e}`);
    } finally {
      warming = false;
    }
  };
  await runWarmup();
  const warmupTimer = setInterval(runWarmup, 60_000);

  // Replies typed in the dashboard's inbox, and inbox checks it asks for while open: the web
  // app only writes the QUEUED row, so look for new ones every few seconds and queue them.
  const picked = new Set<string>(queued.map((q) => q.id));
  const pickUpReplies = async () => {
    try {
      const rows = await rt.prisma.action.findMany({
        where: { status: "QUEUED", OR: [{ type: "REPLY" }, { type: "INBOX_SYNC", payload: { path: ["onDemand"], equals: true } }] },
        select: { id: true, type: true, scheduledAt: true },
        take: 50,
      });
      for (const r of rows) {
        if (picked.has(r.id)) continue;
        picked.add(r.id);
        await scheduleAction(queue, r.id, r.scheduledAt);
        if (r.type === "REPLY") log(`Reply queued (${r.id})`);
      }
    } catch (e) {
      log(`Reply pickup error: ${e instanceof Error ? e.message : e}`);
    }
  };
  const replyTimer = setInterval(pickUpReplies, 5000);

  // Live LinkedIn login windows for the dashboard ("Connect account").
  const connect =
    rt.env.CONNECT_PORT > 0
      ? createConnectServer({
          prisma: rt.prisma,
          sessions: rt.deps.sessions,
          lock: rt.deps.lock,
          tickets: rt.redis,
          encryptionKey: rt.env.SESSION_ENCRYPTION_KEY,
          baseUrl: rt.env.LINKEDIN_BASE_URL,
          launch: rt.deps.launch,
          allowedOrigins: rt.env.WEB_ORIGIN,
          log,
        })
      : null;
  if (connect) {
    connect.server.on("error", (e) => log(`✖ Login-window server could not start: ${e.message}`));
    connect.server.listen(rt.env.CONNECT_PORT, "127.0.0.1", () =>
      log(`Login windows ready on port ${rt.env.CONNECT_PORT} for ${rt.env.WEB_ORIGIN.join(", ")}`),
    );
  }

  const shutdown = async () => {
    log("Stopping… (finishing the current action)");
    clearInterval(timer);
    clearInterval(campaignTimer);
    clearInterval(replyTimer);
    clearInterval(warmupTimer);
    await connect?.closeAll();
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
