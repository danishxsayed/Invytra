import type { PrismaClient } from "@invytra/db";
import type { ActionType } from "@invytra/shared";
import type { SessionTaskContext } from "../browser/types.js";
import {
  checkConnectionStatus,
  fetchInbox,
  sendConnectionRequest,
  sendMessage,
  visitProfile,
  type ActionOutcome,
  type InboxThread,
} from "../linkedin/actions.js";
import { storeInboxThreads } from "./inbox-store.js";

export interface ActionSpec {
  type: ActionType;
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Validates an action's inputs up front (enqueue time), so bad jobs never reach LinkedIn. */
export function validateSpec(spec: ActionSpec): void {
  const needsUrl = spec.type !== "INBOX_SYNC";
  if (needsUrl && !spec.targetUrl) throw new Error(`${spec.type} needs a profile URL`);
  if (spec.type === "MESSAGE" && !String(spec.payload?.text ?? "").trim()) throw new Error("MESSAGE needs text");
}

/** The browser work for one action. */
export function workFor(spec: ActionSpec): (ctx: SessionTaskContext) => Promise<ActionOutcome<any>> {
  validateSpec(spec);
  const url = spec.targetUrl ?? "";
  const p = spec.payload ?? {};
  switch (spec.type) {
    case "PROFILE_VISIT":
      return (ctx) => visitProfile(ctx, url);
    case "CHECK_CONNECTION":
      return (ctx) => checkConnectionStatus(ctx, url);
    case "CONNECTION_REQUEST":
      return (ctx) => sendConnectionRequest(ctx, url, typeof p.note === "string" ? p.note : undefined);
    case "MESSAGE":
      return (ctx) => sendMessage(ctx, url, String(p.text));
    case "INBOX_SYNC":
      return (ctx) => fetchInbox(ctx);
  }
}

/** Follow-up after a successful action (e.g. store new inbox replies). Returns extra result fields. */
export async function afterSuccess(
  prisma: PrismaClient,
  accountId: string,
  type: ActionType,
  data: unknown,
): Promise<Record<string, unknown>> {
  if (type === "INBOX_SYNC") {
    const threads = ((data as { threads?: InboxThread[] })?.threads ?? []) as InboxThread[];
    return { newReplies: await storeInboxThreads(prisma, accountId, threads) };
  }
  return {};
}

/**
 * Whether a failed action may be retried automatically. Messages never are:
 * if the send went through but confirmation failed, a retry would double-send.
 * Invites are safe to retry — a retry sees "Pending" and skips.
 */
export function isRetryable(type: ActionType): boolean {
  return type !== "MESSAGE";
}
