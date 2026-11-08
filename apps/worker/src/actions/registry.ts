import type { PrismaClient } from "@invytra/db";
import { campaignSettingsSchema, eventUrl, outreachTextProblem, type ActionType, type Audience, type SearchKind, type TemplateVars } from "@invytra/shared";
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
import { readOwnAccount } from "../linkedin/account.js";
import { commentOnLatestPost, followProfile, inviteToEvent, likeLatestPost, withdrawInvite } from "../linkedin/engage.js";
import { sendReply } from "../linkedin/reply.js";
import { readSearchPage } from "../linkedin/search.js";
import { recordReply, storeConversations } from "./conversation-store.js";
import { storeInboxThreads } from "./inbox-store.js";

export interface ActionSpec {
  type: ActionType;
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
}

const SEARCH_KINDS: SearchKind[] = ["LINKEDIN_SEARCH", "SALES_NAV_SEARCH", "SALES_NAV_LIST"];

/** Validates an action's inputs up front (enqueue time), so bad jobs never reach LinkedIn. */
export function validateSpec(spec: ActionSpec): void {
  const needsUrl = spec.type !== "INBOX_SYNC" && spec.type !== "REPLY";
  if (needsUrl && !spec.targetUrl) throw new Error(`${spec.type} needs a profile URL`);
  // A message may have no text of its own when AI writes it or it carries a handwritten note, voice or video.
  const extras = spec.type === "MESSAGE" && (spec.payload?.aiWrite === true || !!spec.payload?.card || !!spec.payload?.voice || !!spec.payload?.video);
  if ((spec.type === "MESSAGE" || spec.type === "COMMENT_POST") && !extras && !String(spec.payload?.text ?? "").trim()) throw new Error(`${spec.type} needs text`);
  if (spec.type === "EVENT_INVITE" && !eventUrl(String(spec.payload?.eventUrl ?? ""))) throw new Error("EVENT_INVITE needs a LinkedIn event link");
  if (spec.type === "REPLY" && (!String(spec.payload?.text ?? "").trim() || !String(spec.payload?.name ?? "").trim())) {
    throw new Error("REPLY needs text and the person's name");
  }
  if (spec.type === "SEARCH_PAGE" && !SEARCH_KINDS.includes(spec.payload?.kind as SearchKind)) throw new Error("SEARCH_PAGE needs a search kind");
  // Never send placeholder text like "Hi {firstName}, …" (checked at enqueue AND before sending).
  for (const [field, label] of [["note", "Invite note"], ["text", "Message text"]] as const) {
    const value = spec.payload?.[field];
    if (typeof value === "string" && !(field === "text" && extras && !value.trim())) {
      const problem = outreachTextProblem(value);
      if (problem) throw new Error(`${label} ${problem}: "${value}"`);
    }
  }
}

/** Lead details stored with a campaign action ({firstName}, {company}, …). */
function varsOf(p: Record<string, unknown>): TemplateVars {
  const v = (p.vars ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  // Invytra's own browser doesn't read whole profiles, so {aiLine} is the campaign's fallback line there.
  const fallback = typeof p.aiFallback === "string" ? p.aiFallback : null;
  return { firstName: str("firstName"), lastName: str("lastName"), company: str("company"), title: str("title"), aiLine: fallback };
}

/** A campaign's audience (connection levels / Premium only), sent with a lead's first contact. */
function audienceOf(p: Record<string, unknown>): Audience | undefined {
  if (!p.audience || typeof p.audience !== "object") return undefined;
  const r = campaignSettingsSchema.pick({ degrees: true, premiumOnly: true }).safeParse(p.audience);
  return r.success ? r.data : undefined;
}

/** The browser work for one action. */
export function workFor(spec: ActionSpec): (ctx: SessionTaskContext) => Promise<ActionOutcome<any>> {
  validateSpec(spec);
  const url = spec.targetUrl ?? "";
  const p = spec.payload ?? {};
  const audience = audienceOf(p);
  switch (spec.type) {
    case "PROFILE_VISIT":
      return (ctx) => visitProfile(ctx, url, audience);
    case "CHECK_CONNECTION":
      return (ctx) => checkConnectionStatus(ctx, url);
    case "CONNECTION_REQUEST":
      return (ctx) =>
        sendConnectionRequest(ctx, url, {
          note: typeof p.note === "string" ? p.note : undefined,
          requireNote: p.requireNote === true,
          notesBlocked: p.notesBlocked === true,
          vars: varsOf(p),
          audience,
        });
    case "MESSAGE":
      return (ctx) => sendMessage(ctx, url, String(p.text), varsOf(p), audience);
    case "INBOX_SYNC":
      // `known` (each conversation's last snippet) is added just before running, so changed chats get opened.
      return async (ctx) => {
        const r = await fetchInbox(ctx, { known: (p.known ?? undefined) as Record<string, string> | undefined });
        if (p.checkPremium !== true || r.outcome !== "DONE") return r;
        const own = await readOwnAccount(ctx.page, ctx.baseUrl).catch(() => ({ premium: null, photo: null }));
        return { ...r, data: { ...r.data, ownPremium: own.premium, ownPhoto: own.photo } };
      };
    case "SEARCH_PAGE":
      return (ctx) => readSearchPage(ctx, url, p.kind as SearchKind);
    case "LIKE_POST":
      return (ctx) => likeLatestPost(ctx, url, audience);
    case "COMMENT_POST":
      return (ctx) => commentOnLatestPost(ctx, url, String(p.text), varsOf(p), audience);
    case "EVENT_INVITE":
      return (ctx) => inviteToEvent(ctx, String(p.eventUrl), String(p.name ?? ""));
    case "FOLLOW_PROFILE":
      return (ctx) => followProfile(ctx, url, audience);
    case "WITHDRAW_INVITE":
      return (ctx) => withdrawInvite(ctx, url);
    case "REPLY":
      return (ctx) => sendReply(ctx, String(p.name), String(p.text), spec.targetUrl);
  }
}

/** Follow-up after a successful action (e.g. store new inbox replies). Returns extra result fields. */
export async function afterSuccess(
  prisma: PrismaClient,
  action: { accountId: string; type: ActionType; inboxMessageId?: string | null; conversationId?: string | null; payload?: unknown },
  data: unknown,
): Promise<Record<string, unknown>> {
  const { accountId, type } = action;
  // A reply sent from Invytra answers that conversation.
  if (type === "REPLY") {
    const text = String(((action.payload ?? {}) as { text?: unknown }).text ?? "");
    if (action.conversationId && text) await recordReply(prisma, action.conversationId, text);
    if (action.inboxMessageId) {
      await prisma.inboxMessage.updateMany({ where: { id: action.inboxMessageId, answeredAt: null }, data: { answeredAt: new Date() } });
    }
    return {};
  }
  if (type === "INBOX_SYNC") {
    const threads = ((data as { threads?: InboxThread[] })?.threads ?? []) as InboxThread[];
    const account = await prisma.linkedinAccount.findUnique({ where: { id: accountId }, select: { timezone: true } });
    const newReplies = await storeInboxThreads(prisma, accountId, threads);
    const changed = await storeConversations(prisma, accountId, threads, account?.timezone ?? "UTC");
    // Asked to look at the account's plan this time: record when (and what, if it could tell).
    if (data && typeof data === "object" && "ownPremium" in data) {
      const { ownPremium, ownPhoto } = data as { ownPremium: unknown; ownPhoto?: { base64: string; type: string } | null };
      await prisma.linkedinAccount.update({
        where: { id: accountId },
        data: {
          premiumCheckedAt: new Date(),
          ...(typeof ownPremium === "boolean" && { premium: ownPremium }),
          ...(ownPhoto && { avatar: Buffer.from(ownPhoto.base64, "base64"), avatarType: ownPhoto.type, avatarUpdatedAt: new Date() }),
        },
      });
    }
    // Keep the action log small: the messages themselves live in conversation_messages.
    // The photo lives on the account row, not in the action log.
    return { newReplies, changedConversations: changed, threads: threads.map(({ messages, ...t }) => ({ ...t, read: messages?.length ?? 0 })), ownPhoto: undefined };
  }
  return {};
}

/**
 * Whether a failed action may be retried automatically. Messages never are:
 * if the send went through but confirmation failed, a retry would double-send.
 * Invites are safe to retry — a retry sees "Pending" and skips.
 */
export function isRetryable(type: ActionType): boolean {
  return type !== "MESSAGE" && type !== "REPLY" && type !== "COMMENT_POST";
}
