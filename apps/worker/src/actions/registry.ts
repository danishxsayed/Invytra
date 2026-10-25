import type { PrismaClient } from "@invytra/db";
import { outreachTextProblem, type ActionType, type SearchKind, type TemplateVars } from "@invytra/shared";
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
import { likeLatestPost, withdrawInvite } from "../linkedin/engage.js";
import { readSearchPage } from "../linkedin/search.js";
import { storeInboxThreads } from "./inbox-store.js";

export interface ActionSpec {
  type: ActionType;
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
}

const SEARCH_KINDS: SearchKind[] = ["LINKEDIN_SEARCH", "SALES_NAV_SEARCH", "SALES_NAV_LIST"];

/** Validates an action's inputs up front (enqueue time), so bad jobs never reach LinkedIn. */
export function validateSpec(spec: ActionSpec): void {
  const needsUrl = spec.type !== "INBOX_SYNC";
  if (needsUrl && !spec.targetUrl) throw new Error(`${spec.type} needs a profile URL`);
  if (spec.type === "MESSAGE" && !String(spec.payload?.text ?? "").trim()) throw new Error("MESSAGE needs text");
  if (spec.type === "SEARCH_PAGE" && !SEARCH_KINDS.includes(spec.payload?.kind as SearchKind)) throw new Error("SEARCH_PAGE needs a search kind");
  // Never send placeholder text like "Hi {firstName}, …" (checked at enqueue AND before sending).
  for (const [field, label] of [["note", "Invite note"], ["text", "Message text"]] as const) {
    const value = spec.payload?.[field];
    if (typeof value === "string") {
      const problem = outreachTextProblem(value);
      if (problem) throw new Error(`${label} ${problem}: "${value}"`);
    }
  }
}

/** Lead details stored with a campaign action ({firstName}, {company}, …). */
function varsOf(p: Record<string, unknown>): TemplateVars {
  const v = (p.vars ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  return { firstName: str("firstName"), lastName: str("lastName"), company: str("company"), title: str("title") };
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
      return (ctx) =>
        sendConnectionRequest(ctx, url, {
          note: typeof p.note === "string" ? p.note : undefined,
          requireNote: p.requireNote === true,
          notesBlocked: p.notesBlocked === true,
          vars: varsOf(p),
        });
    case "MESSAGE":
      return (ctx) => sendMessage(ctx, url, String(p.text), varsOf(p));
    case "INBOX_SYNC":
      return (ctx) => fetchInbox(ctx);
    case "SEARCH_PAGE":
      return (ctx) => readSearchPage(ctx, url, p.kind as SearchKind);
    case "LIKE_POST":
      return (ctx) => likeLatestPost(ctx, url);
    case "WITHDRAW_INVITE":
      return (ctx) => withdrawInvite(ctx, url);
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
