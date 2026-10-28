import type { PrismaClient } from "@invytra/db";
import { ACTION_DELAY_SECONDS, FETCH_ALL_SEARCH_PAGES_PER_DAY, SEARCH_DELAY_SECONDS, randomActionDelayMs } from "@invytra/shared";

/** How often an inbox check also re-reads whether the account has Premium (shown on the Accounts page). */
const PREMIUM_RECHECK_MS = 7 * 24 * 3600_000;
import type { SessionManagerDeps } from "../browser/session-manager.js";
import { isRetryable, workFor } from "../actions/registry.js";
import { accountSettings, checkPolicy, executeActionRow } from "../actions/run-action.js";
import { hoursForAction, isFetchAllPage, isOnDemandInboxCheck } from "../campaigns/sending-days.js";
import type { PacingStore } from "./pacing.js";
import {
  CLAIM_HOLD_MS,
  MAX_ATTEMPTS,
  busyRetryAt,
  inboxCheckRetryAt,
  inviteBlockUntil,
  notesBlockUntil,
  pollAgainAt,
  rescheduleFor,
  retryAt,
} from "./plan.js";

/** Replies: skip an after-action gap up to this long; otherwise look again this soon. */
const REPLY_GAP_MAX_MS = 5 * 60_000;
const REPLY_RETRY_MS = 15_000;

export interface ProcessorDeps {
  prisma: PrismaClient;
  session: SessionManagerDeps;
  pacing: PacingStore;
  ignoreWorkingHours: boolean;
  /** Multiplier for the gap between actions. 1 in production; tests use a small value. */
  gapScale?: number;
  now?: () => Date;
}

export type ProcessResult =
  | { kind: "done"; status: "SUCCEEDED" | "SKIPPED" | "FAILED"; detail?: string }
  | { kind: "reschedule"; runAt: Date; reason: string }
  | { kind: "ignored"; reason: string };

/**
 * Handles one queued action. Never touches LinkedIn unless policy, pacing and
 * the account lock all allow it; otherwise returns when to look again.
 */
export async function processAction(deps: ProcessorDeps, actionId: string): Promise<ProcessResult> {
  const { prisma } = deps;
  const now = deps.now?.() ?? new Date();
  const action = await prisma.action.findUnique({ where: { id: actionId }, include: { account: true } });
  if (!action) return { kind: "ignored", reason: "action deleted" };
  if (action.status !== "QUEUED") return { kind: "ignored", reason: `already ${action.status}` };

  const defer = async (runAt: Date, reason: string): Promise<ProcessResult> => {
    // Waiting for its turn keeps the original scheduledAt, so queue order is preserved.
    const keepOrder = reason === "WAITING_TURN" || reason === "PACING" || reason === "ACCOUNT_BUSY";
    await prisma.action.update({
      where: { id: action.id },
      data: { ...(keepOrder ? {} : { scheduledAt: runAt }), error: `waiting: ${reason}` },
    });
    return { kind: "reschedule", runAt, reason };
  };

  // 1. Limits, working hours, account status
  const hours = await hoursForAction(prisma, action, accountSettings(action.account).hours);
  const pages = isFetchAllPage(action) ? FETCH_ALL_SEARCH_PAGES_PER_DAY : undefined;
  const decision = await checkPolicy(prisma, action.account, action.type, now, deps.ignoreWorkingHours, hours, pages);
  if (!decision.allowed) {
    return defer(rescheduleFor(decision.reason, now, action.account.timezone, hours), decision.reason);
  }

  // 1b. Campaign messages: never send if they replied, and only after the inbox has been read
  //     since we last contacted them (the reply may be sitting there unread).
  if (action.type === "MESSAGE" && action.campaignLeadId) {
    const lead = await prisma.campaignLead.findUnique({
      where: { id: action.campaignLeadId },
      select: { state: true, lastActionAt: true },
    });
    if (lead?.state === "REPLIED") {
      await prisma.action.update({ where: { id: action.id }, data: { status: "SKIPPED", error: "REPLIED", executedAt: now } });
      return { kind: "done", status: "SKIPPED", detail: "they replied — follow-up not sent" };
    }
    const since = lead?.lastActionAt ?? action.createdAt;
    const inboxRead = await prisma.action.findFirst({
      where: { accountId: action.accountId, type: "INBOX_SYNC", status: "SUCCEEDED", executedAt: { gt: since } },
      select: { id: true },
    });
    if (!inboxRead) {
      const at = inboxCheckRetryAt(now);
      const scale = deps.gapScale ?? 1;
      return defer(new Date(now.getTime() + Math.max(1000, (at.getTime() - now.getTime()) * scale)), "WAITING_INBOX_CHECK");
    }
  }

  // 2. Invites paused after LinkedIn's weekly limit
  if (action.type === "CONNECTION_REQUEST") {
    const blocked = await deps.pacing.get(action.accountId, "inviteBlockedUntil");
    if (blocked && blocked > now) return defer(blocked, "INVITES_PAUSED");
  }

  // 3. One account = one queue: only the oldest due action may run, and only
  //    after the human-like gap since the previous one. Others poll cheaply.
  const head = await prisma.action.findFirst({
    where: { accountId: action.accountId, status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const scale = deps.gapScale ?? 1;
  const scaled = (d: Date) => new Date(now.getTime() + Math.max(1000, (d.getTime() - now.getTime()) * scale));
  // A reply the user is waiting for goes ahead of queued campaign work.
  // Things someone is waiting for in the dashboard (a reply, an inbox check) go ahead of queued campaign work.
  const urgent = action.type === "REPLY" || isOnDemandInboxCheck(action);
  if (head && head.id !== action.id && !urgent) return defer(scaled(pollAgainAt(now, null)), "WAITING_TURN");
  const heldUntil = await deps.pacing.claim(action.accountId, now, new Date(now.getTime() + CLAIM_HOLD_MS));
  if (heldUntil) {
    if (!urgent) return defer(scaled(pollAgainAt(now, heldUntil)), "PACING");
    // A reply the user is waiting for skips the human-like gap after the last action (a few
    // minutes at most), but never runs while another action is still going (a 15-minute hold).
    if (heldUntil.getTime() - now.getTime() > REPLY_GAP_MAX_MS) return defer(new Date(now.getTime() + REPLY_RETRY_MS), "ACCOUNT_BUSY");
    await deps.pacing.set(action.accountId, "nextActionAt", new Date(now.getTime() + CLAIM_HOLD_MS));
  }

  // 4. Run it
  const payload = { ...((action.payload ?? {}) as Record<string, unknown>) };
  // Inbox checks open chats that changed since last time: give it what it saw last time.
  if (action.type === "INBOX_SYNC") {
    const convs = await prisma.conversation.findMany({ where: { accountId: action.accountId }, select: { participantName: true, lastSnippetKey: true } });
    payload.known = Object.fromEntries(convs.map((c) => [c.participantName, c.lastSnippetKey ?? ""]));
    // About once a week, also look at whether the account has LinkedIn Premium (invite notes need it).
    const checked = action.account.premiumCheckedAt;
    if (!checked || now.getTime() - checked.getTime() > PREMIUM_RECHECK_MS) payload.checkPremium = true;
  }
  if (action.type === "CONNECTION_REQUEST" && payload.note) {
    const notesBlocked = await deps.pacing.get(action.accountId, "notesBlockedUntil");
    if (notesBlocked && notesBlocked > now) payload.notesBlocked = true;
  }
  const spec = { type: action.type, targetUrl: action.targetUrl, payload };
  let work;
  try {
    work = workFor(spec); // re-validates, e.g. refuses placeholder text queued by an older version
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.action.update({ where: { id: action.id }, data: { status: "FAILED", error, executedAt: now } });
    await deps.pacing.set(action.accountId, "nextActionAt", now); // release the claim
    return { kind: "done", status: "FAILED", detail: error };
  }
  const result = await executeActionRow(prisma, deps.session, action, work);
  const finished = deps.now?.() ?? new Date();

  // Another worker held the account lock — nothing was done on LinkedIn; retry shortly.
  if (result.status === "FAILED" && result.errorKind === "BUSY") {
    await prisma.action.update({ where: { id: action.id }, data: { status: "QUEUED", attempts: { decrement: 1 } } });
    await deps.pacing.set(action.accountId, "nextActionAt", finished); // release our claim
    return defer(urgent ? new Date(finished.getTime() + REPLY_RETRY_MS) : busyRetryAt(finished), "ACCOUNT_BUSY");
  }

  if (result.status !== "FAILED" && (result.data as { noteLimitHit?: boolean } | undefined)?.noteLimitHit) {
    await deps.pacing.set(action.accountId, "notesBlockedUntil", notesBlockUntil(finished));
  }
  const gap = randomActionDelayMs(Math.random, action.type === "SEARCH_PAGE" ? SEARCH_DELAY_SECONDS : ACTION_DELAY_SECONDS) * (deps.gapScale ?? 1);
  await deps.pacing.set(action.accountId, "nextActionAt", new Date(finished.getTime() + gap));
  if (result.status !== "FAILED") return { kind: "done", status: result.status };
  if (result.errorKind === "INVITE_LIMIT") {
    await deps.pacing.set(action.accountId, "inviteBlockedUntil", inviteBlockUntil(finished));
    return { kind: "done", status: "FAILED", detail: "weekly invite limit — invites paused for 3 days" };
  }
  const attempts = action.attempts + 1;
  if (result.errorKind === "OTHER" && isRetryable(action.type) && attempts < MAX_ATTEMPTS) {
    await prisma.action.update({ where: { id: action.id }, data: { status: "QUEUED" } });
    return defer(retryAt(finished, attempts), `RETRY ${attempts}/${MAX_ATTEMPTS - 1} after: ${result.error.split("\n")[0]}`);
  }
  return { kind: "done", status: "FAILED", detail: result.error.split("\n")[0] };
}
