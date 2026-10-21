import type { PrismaClient } from "@invytra/db";
import { randomActionDelayMs } from "@invytra/shared";
import type { SessionManagerDeps } from "../browser/session-manager.js";
import { isRetryable, workFor } from "../actions/registry.js";
import { accountSettings, checkPolicy, executeActionRow } from "../actions/run-action.js";
import type { PacingStore } from "./pacing.js";
import { CLAIM_HOLD_MS, MAX_ATTEMPTS, busyRetryAt, inviteBlockUntil, pollAgainAt, rescheduleFor, retryAt } from "./plan.js";

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
  const decision = await checkPolicy(prisma, action.account, action.type, now, deps.ignoreWorkingHours);
  if (!decision.allowed) {
    const { hours } = accountSettings(action.account);
    return defer(rescheduleFor(decision.reason, now, action.account.timezone, hours), decision.reason);
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
  if (head && head.id !== action.id) return defer(scaled(pollAgainAt(now, null)), "WAITING_TURN");
  const heldUntil = await deps.pacing.claim(action.accountId, now, new Date(now.getTime() + CLAIM_HOLD_MS));
  if (heldUntil) return defer(scaled(pollAgainAt(now, heldUntil)), "PACING");

  // 4. Run it
  const spec = {
    type: action.type,
    targetUrl: action.targetUrl,
    payload: (action.payload ?? {}) as Record<string, unknown>,
  };
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
    return defer(busyRetryAt(finished), "ACCOUNT_BUSY");
  }

  const gap = randomActionDelayMs() * (deps.gapScale ?? 1);
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
