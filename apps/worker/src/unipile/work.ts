import { UnipileError, isPersonChat, type AiLineWriter, type LinkedinAccount, type PrismaClient, type UnipileClient, type UnipileUser } from "@invytra/db";
import {
  COMMENT_MAX,
  MESSAGE_MAX,
  NOTE_MAX,
  RESULTS_PER_PAGE,
  audienceSkip,
  cleanPersonName,
  fillTemplate,
  parseProfileUrl,
  splitName,
  type ActionType,
  type Audience,
  type Degree,
  type SearchKind,
  type TemplateVars,
} from "@invytra/shared";
import { InviteLimitReachedError, type ActionOutcome } from "../linkedin/actions.js";
import type { InboxThread, ThreadMessage } from "../linkedin/inbox.js";
import type { ConnectionStatus } from "../linkedin/profile.js";
import { companyFromHeadline, type FoundPerson } from "../linkedin/search.js";
import { NO_AI_LINE, NO_CREDITS, aiLineFor, aiWriteFor } from "./ai-line.js";
import { cardImageFor, cardOf } from "./card.js";

/**
 * Every campaign action for an account connected through Unipile: the same inputs and
 * results as the browser versions (../linkedin/*), done through Unipile's API instead.
 * Limits, working hours and pacing are unchanged — they're applied before this runs.
 */
export interface UnipileCtx {
  client: UnipileClient;
  /** Writes {aiLine}; undefined = from OPENAI_API_KEY, null = no AI. */
  ai?: AiLineWriter | null;
  /** The account's id at Unipile. */
  accountId: string;
  account: Pick<LinkedinAccount, "id" | "timezone">;
  prisma: PrismaClient;
  /** For replies: the Invytra conversation being answered. */
  conversationId?: string | null;
}

export interface UnipileSpec {
  /** The campaign lead this action is for (its {aiLine} is written once and kept). */
  campaignLeadId?: string | null;
  type: ActionType;
  targetUrl?: string | null;
  payload?: Record<string, unknown> | null;
}

const slugOf = (url: string) => {
  const r = parseProfileUrl(url);
  if (!r.ok) throw new Error(`${r.reason}: ${url}`);
  return r.slug;
};

export function degreeOf(d: string | undefined | null): Degree | null {
  const v = (d ?? "").toUpperCase();
  if (v === "FIRST_DEGREE" || v === "DISTANCE_1") return 1;
  if (v === "SECOND_DEGREE" || v === "DISTANCE_2") return 2;
  if (v === "THIRD_DEGREE" || v === "DISTANCE_3" || v === "OUT_OF_NETWORK") return 3;
  return null;
}

export function statusOf(u: UnipileUser): ConnectionStatus {
  if (u.network_distance === "FIRST_DEGREE" || u.is_relationship) return "CONNECTED";
  if (u.invitation?.type === "SENT" && u.invitation.status === "PENDING") return "PENDING";
  return "NOT_CONNECTED";
}

const fullName = (u: { first_name?: string; last_name?: string }) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
/** The email they share with connections (LinkedIn shows none to anyone else). */
export const emailOf = (u: UnipileUser): string | undefined =>
  (u.contact_info?.emails ?? []).map((e) => (typeof e === "string" ? e.trim().toLowerCase() : "")).find((e) => EMAIL.test(e));
const facts = (u: UnipileUser) => ({ degree: degreeOf(u.network_distance), premium: !!u.is_premium, ...(emailOf(u) && { email: emailOf(u) }) });

function varsOf(p: Record<string, unknown>): TemplateVars {
  const v = (p.vars ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  return { firstName: str("firstName"), lastName: str("lastName"), company: str("company"), title: str("title") };
}

function audienceOf(p: Record<string, unknown>): Audience | undefined {
  const a = p.audience as Audience | undefined;
  return a && Array.isArray(a.degrees) ? a : undefined;
}

/**
 * Fills a note/message/comment, writing {aiLine} from their profile first when the text uses
 * it. "skip" = no AI line and no fallback: nothing generic is sent.
 */
async function fillFor(
  ctx: UnipileCtx,
  spec: UnipileSpec,
  template: string,
  u: UnipileUser,
  limit: number,
): Promise<string | null | "skip"> {
  const p = spec.payload ?? {};
  const vars = varsOf(p);
  if (template.includes("{aiLine}")) {
    const line = await aiLineFor(ctx, {
      campaignLeadId: spec.campaignLeadId,
      providerId: u.provider_id,
      template,
      limit,
      fallback: typeof p.aiFallback === "string" ? p.aiFallback : undefined,
    });
    // Out of AI credits and no fallback: the message goes without the AI line.
    if (line === NO_CREDITS) return fillTemplate(withoutAiLine(template), vars, fullName(u));
    if (!line) return "skip";
    vars.aiLine = line;
  }
  return fillTemplate(template, vars, fullName(u));
}

/** The template with {aiLine} taken out (and the spacing around it tidied). */
export const withoutAiLine = (t: string) =>
  t
    .replace(/[ \t]*\{aiLine\}[ \t]*/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();

/** Their profile, or null if LinkedIn has no such profile. */
async function profile(ctx: UnipileCtx, slug: string, notify = false): Promise<UnipileUser | null> {
  try {
    return await ctx.client.user(ctx.accountId, slug, notify);
  } catch (e) {
    if (e instanceof UnipileError && (e.status === 404 || e.type.includes("not_found") || e.type.includes("invalid_resource"))) return null;
    throw e;
  }
}

const outside = (audience: Audience | undefined, u: UnipileUser) => (audience ? audienceSkip(audience, facts(u)) : null);

/** The work for one action, run inside withUnipileAccount. */
export function unipileWorkFor(spec: UnipileSpec): (ctx: UnipileCtx) => Promise<ActionOutcome<any>> {
  const url = spec.targetUrl ?? "";
  const p = spec.payload ?? {};
  const audience = audienceOf(p);
  switch (spec.type) {
    case "PROFILE_VISIT":
      return async (ctx) => {
        const u = await profile(ctx, slugOf(url), true);
        if (!u) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
        const data = { url: u.public_identifier ? `https://www.linkedin.com/in/${u.public_identifier}/` : url, name: fullName(u), headline: u.headline ?? "", status: statusOf(u), ...facts(u) };
        const out = outside(audience, u);
        return out ? { outcome: "SKIPPED", reason: out, data } : { outcome: "DONE", data };
      };

    case "CHECK_CONNECTION":
      return async (ctx) => {
        const u = await profile(ctx, slugOf(url));
        if (!u) return { outcome: "DONE", data: { status: "UNAVAILABLE", name: "" } };
        return { outcome: "DONE", data: { status: statusOf(u), name: fullName(u), ...facts(u) } };
      };

    case "CONNECTION_REQUEST":
      return async (ctx) => {
        const u = await profile(ctx, slugOf(url));
        if (!u) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
        const name = fullName(u);
        const base = { name, withNote: false, ...facts(u), url: u.public_identifier ? `https://www.linkedin.com/in/${u.public_identifier}/` : url };
        const out = outside(audience, u);
        if (out) return { outcome: "SKIPPED", reason: out, data: base };
        const status = statusOf(u);
        if (status !== "NOT_CONNECTED") return { outcome: "SKIPPED", reason: status, data: base };
        const raw = typeof p.note === "string" ? p.note.trim() : "";
        const written = p.aiWrite === true ? await aiWriteFor(ctx, { campaignLeadId: spec.campaignLeadId, providerId: u.provider_id, guide: raw, kind: "note", maxChars: 200 }) : null;
        const filled = written ?? (raw ? await fillFor(ctx, spec, raw, u, NOTE_MAX) : undefined);
        if (filled === "skip") return { outcome: "SKIPPED", reason: NO_AI_LINE, data: base };
        let note = filled;
        if (note === null) return { outcome: "SKIPPED", reason: "MISSING_DETAIL", data: base };
        // LinkedIn stopped this account's notes for now: send without one (or skip if a note is required).
        if (note && p.notesBlocked === true) {
          if (p.requireNote === true) return { outcome: "SKIPPED", reason: "NOTE_LIMIT", data: base };
          note = undefined;
        }
        try {
          await ctx.client.invite(ctx.accountId, u.provider_id, note || undefined);
          return { outcome: "DONE", data: { ...base, withNote: !!note, ...(written && note === written && { aiWritten: true, note }) } };
        } catch (e) {
          if (!(e instanceof UnipileError) || e.status !== 422) throw e;
          const why = `${e.type} ${e.detail}`.toLowerCase();
          const aboutNote = !!note && /note|message/.test(why);
          if (!aboutNote && /limit|too many|weekly/.test(why)) throw new InviteLimitReachedError();
          if (!aboutNote && /already.*connect|connected/.test(why)) return { outcome: "SKIPPED", reason: "CONNECTED", data: base };
          if (!aboutNote && /already|pending|invited/.test(why)) return { outcome: "SKIPPED", reason: "PENDING", data: base };
          // Probably the note (a free account out of notes): send it without one, as the browser version does.
          if (note && p.requireNote === true) return { outcome: "SKIPPED", reason: "NOTE_LIMIT", data: base };
          if (note) {
            await ctx.client.invite(ctx.accountId, u.provider_id);
            return { outcome: "DONE", data: { ...base, withNote: false, noteLimitHit: aboutNote } };
          }
          return { outcome: "SKIPPED", reason: "CONNECT_NOT_AVAILABLE", data: base };
        }
      };

    case "MESSAGE":
      return async (ctx) => {
        const u = await profile(ctx, slugOf(url));
        if (!u) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
        const data = { name: fullName(u), ...facts(u) };
        const out = outside(audience, u);
        if (out) return { outcome: "SKIPPED", reason: out, data };
        const status = statusOf(u);
        if (status !== "CONNECTED") return { outcome: "SKIPPED", reason: `NOT_CONNECTED (${status})`, data };
        const guide = String(p.text ?? "").trim();
        // A handwritten card for this person: its text filled in like a message (2 AI credits).
        const card = cardOf(p);
        let image: Buffer | undefined;
        if (card) {
          const cardText = fillTemplate(card.text.trim(), varsOf(p), fullName(u));
          if (cardText === null) return { outcome: "SKIPPED", reason: "MISSING_DETAIL", data };
          const png = await cardImageFor(ctx, spec.campaignLeadId, { ...card, text: cardText });
          if (png !== "NO_CREDITS") image = png;
        }
        const written = p.aiWrite === true ? await aiWriteFor(ctx, { campaignLeadId: spec.campaignLeadId, providerId: u.provider_id, guide, kind: "message", maxChars: Math.min(MESSAGE_MAX, 1200) }) : null;
        if (!written && !guide && !image) return { outcome: "SKIPPED", reason: card ? "NO_AI_CREDITS" : "NO_AI_TEXT", data };
        const text = written ?? (guide ? await fillFor(ctx, spec, guide, u, MESSAGE_MAX) : "");
        if (text === "skip") return { outcome: "SKIPPED", reason: NO_AI_LINE, data };
        if (text === null) return { outcome: "SKIPPED", reason: "MISSING_DETAIL", data };
        try {
          await ctx.client.startChat(ctx.accountId, u.provider_id, text, image && { png: image, name: "note.png" });
        } catch (e) {
          if (e instanceof UnipileError && e.status === 422 && /no_connection/.test(e.type)) return { outcome: "SKIPPED", reason: "NOT_CONNECTED (NOT_CONNECTED)", data };
          throw e;
        }
        return { outcome: "DONE", data: { ...data, ...(written && { aiWritten: true, text }), ...(image && { card: true }) } };
      };

    case "LIKE_POST":
    case "COMMENT_POST":
      return async (ctx) => {
        // Posts are looked up by LinkedIn's member id, so the profile is always read first.
        const u = await profile(ctx, slugOf(url));
        if (!u) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
        const factsSeen = facts(u);
        const out = outside(audience, u);
        if (out) return { outcome: "SKIPPED", reason: out, data: { liked: false, ...factsSeen } };
        const text = spec.type === "COMMENT_POST" ? await fillFor(ctx, spec, String(p.text ?? "").trim(), u, COMMENT_MAX) : "";
        if (text === "skip") return { outcome: "SKIPPED", reason: NO_AI_LINE, data: { liked: false, ...factsSeen } };
        if (text === null) return { outcome: "SKIPPED", reason: "MISSING_DETAIL", data: { liked: false, ...factsSeen } };
        let posts;
        try {
          posts = (await ctx.client.userPosts(ctx.accountId, u.provider_id, 5)).filter((x) => !x.is_repost);
        } catch (e) {
          if (e instanceof UnipileError && (e.status === 404 || e.status === 422)) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
          throw e;
        }
        const post = posts[0];
        if (!post) return { outcome: "SKIPPED", reason: "NO_POSTS", data: { liked: false, ...factsSeen } };
        let liked = true;
        try {
          await ctx.client.react(ctx.accountId, post.social_id);
        } catch (e) {
          // Already liked: fine, carry on (and still comment).
          if (!(e instanceof UnipileError && e.status === 422)) throw e;
          liked = false;
          if (spec.type === "LIKE_POST") return { outcome: "SKIPPED", reason: "ALREADY_LIKED", data: { liked, ...factsSeen } };
        }
        if (spec.type === "COMMENT_POST") {
          await ctx.client.comment(ctx.accountId, post.social_id, text!);
          return { outcome: "DONE", data: { commented: true, liked, ...factsSeen } };
        }
        return { outcome: "DONE", data: { liked: true, ...factsSeen } };
      };

    case "WITHDRAW_INVITE":
      return async (ctx) => {
        const slug = slugOf(url);
        const u = await profile(ctx, slug);
        if (!u) return { outcome: "SKIPPED", reason: "PROFILE_UNAVAILABLE" };
        const data = { name: fullName(u) };
        let cursor: string | undefined;
        for (let i = 0; i < 10; i++) {
          const page = await ctx.client.sentInvitations(ctx.accountId, cursor);
          const hit = page.items.find((x) => x.invited_user_id === u.provider_id || (x.invited_user_public_id ?? "").toLowerCase() === slug.toLowerCase());
          if (hit) {
            await ctx.client.cancelInvitation(ctx.accountId, hit.id);
            return { outcome: "DONE", data };
          }
          if (!page.cursor) break;
          cursor = page.cursor;
        }
        const status = statusOf(u);
        return { outcome: "SKIPPED", reason: status === "CONNECTED" ? "CONNECTED" : "NOT_PENDING", data };
      };

    case "SEARCH_PAGE":
      return async (ctx) => {
        const kind = p.kind as SearchKind;
        const per = RESULTS_PER_PAGE[kind] ?? 10;
        const page = Number(p.page ?? 1);
        let r;
        try {
          r = await ctx.client.search(ctx.accountId, url, per);
        } catch (e) {
          if (e instanceof UnipileError && e.status === 403) return { outcome: "SKIPPED", reason: kind === "LINKEDIN_SEARCH" ? "SEARCH_LIMIT" : "NO_SALES_NAV" };
          if (e instanceof UnipileError && e.status === 429) return { outcome: "SKIPPED", reason: "SEARCH_LIMIT" };
          throw e;
        }
        const people: FoundPerson[] = [];
        const seen = new Set<string>();
        for (const it of r.items ?? []) {
          if (it.type && it.type !== "PEOPLE") continue;
          const id = it.public_identifier || it.id;
          if (!id) continue;
          const profileUrl = `https://www.linkedin.com/in/${id}/`;
          if (seen.has(profileUrl)) continue;
          seen.add(profileUrl);
          const name = cleanPersonName(it.name ?? fullName(it));
          if (!name || /^linkedin member$/i.test(name)) continue;
          const [firstName, lastName] = it.first_name ? [it.first_name, it.last_name ?? null] : splitName(name);
          people.push({
            profileUrl,
            firstName,
            lastName,
            title: it.headline || null,
            company: companyFromHeadline(it.headline ?? null),
            location: it.location || null,
            degree: degreeOf(it.network_distance),
            premium: !!it.premium,
          });
        }
        // LinkedIn often leaves the total empty (null): then a (nearly) full page means there are more.
        const total = r.paging?.total_count;
        const hasNext = people.length > 0 && (typeof total === "number" && total > 0 ? page * per < total : people.length >= per * 0.8);
        return { outcome: "DONE", data: { people, hasNext } };
      };

    case "INBOX_SYNC":
      return (ctx) => readInbox(ctx, { known: (p.known ?? {}) as Record<string, string>, checkPremium: p.checkPremium === true });

    case "REPLY":
      return async (ctx) => {
        const text = String(p.text ?? "").trim();
        const name = String(p.name ?? "").trim();
        const conv = ctx.conversationId ? await ctx.prisma.conversation.findUnique({ where: { id: ctx.conversationId }, select: { externalId: true } }) : null;
        if (conv?.externalId) {
          await ctx.client.sendInChat(conv.externalId, text, ctx.accountId);
          return { outcome: "DONE", data: { via: "inbox" } };
        }
        if (url) {
          const u = await profile(ctx, slugOf(url));
          if (u) {
            await ctx.client.startChat(ctx.accountId, u.provider_id, text);
            return { outcome: "DONE", data: { via: "profile" } };
          }
        }
        // Find the chat by the person's name among recent chats.
        for (const c of await ctx.client.chats(ctx.accountId, 50)) {
          if (!isPersonChat(c)) continue;
          const other = await otherName(ctx, c.id, c.type === 1 ? c.name : null);
          if (other && other.toLowerCase() === name.toLowerCase()) {
            await ctx.client.sendInChat(c.id, text, ctx.accountId);
            return { outcome: "DONE", data: { via: "inbox" } };
          }
        }
        throw new Error(`The conversation with ${name} isn't in the recent messages`);
      };

    case "FOLLOW_PROFILE":
    case "EVENT_INVITE":
      // Not offered through Unipile: the step is skipped and the sequence carries on.
      return async () => ({ outcome: "SKIPPED", reason: "NOT_AVAILABLE_UNIPILE" });
  }
}

/** The other person's name (a group chat's own name when given). */
async function otherName(ctx: UnipileCtx, chatId: string, chatName?: string | null): Promise<string> {
  if (chatName) return chatName;
  const people = await ctx.client.chatAttendees(chatId);
  return people.find((a) => !a.is_self)?.name ?? "";
}

/** "Oct 18, 2025" and "12:15 PM" in the account's time zone — the labels the browser version reads. */
function labels(at: Date, timeZone: string): Pick<ThreadMessage, "dateLabel" | "timeLabel"> {
  return {
    dateLabel: at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }),
    timeLabel: at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
  };
}

/** The inbox: recent chats, reading the messages of chats that are new or changed. */
async function readInbox(ctx: UnipileCtx, opts: { known: Record<string, string>; checkPremium: boolean }): Promise<ActionOutcome<{ threads: InboxThread[]; ownPremium?: boolean | null; ownPhoto?: { base64: string; type: string } | null }>> {
  const threads: InboxThread[] = [];
  // Names of chats already in the inbox, so only new chats need their people looked up.
  const knownChats = new Map(
    (await ctx.prisma.conversation.findMany({ where: { accountId: ctx.account.id, externalId: { not: null } }, select: { externalId: true, participantName: true } })).map(
      (c) => [c.externalId!, c.participantName],
    ),
  );
  const chats = await ctx.client.chats(ctx.accountId, 30);
  // Ads and other chats nobody can answer don't belong in the inbox (and earlier checks may have stored some).
  const notPeople = chats.filter((c) => !isPersonChat(c)).map((c) => c.id);
  if (notPeople.length) await ctx.prisma.conversation.deleteMany({ where: { accountId: ctx.account.id, externalId: { in: notPeople }, campaignLeadId: null } });
  for (const chat of chats.filter(isPersonChat).slice(0, 25)) {
    const name = knownChats.get(chat.id) ?? (await otherName(ctx, chat.id, chat.type === 1 ? chat.name : null));
    if (!name) continue;
    // A chat's last-activity time says whether anything changed: only changed chats are read.
    const listKey = chat.timestamp ? `t:${chat.timestamp}` : null;
    const unread = (chat.unread_count ?? 0) > 0;
    if (listKey && opts.known[name] === listKey) {
      threads.push({ threadId: chat.id, externalId: chat.id, name, snippet: "", timeText: chat.timestamp!, unread, messageKey: listKey });
      continue;
    }
    const msgs = (await ctx.client.chatMessages(chat.id, 20)).filter((m) => (m.text ?? "").trim());
    msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const last = msgs.at(-1);
    if (!last) continue;
    const fromMe = !!Number(last.is_sender);
    const first = name.split(" ")[0];
    threads.push({
      threadId: chat.id,
      externalId: chat.id,
      name,
      snippet: `${fromMe ? "You" : first}: ${(last.text ?? "").trim()}`,
      timeText: last.timestamp,
      unread,
      messageKey: listKey ?? last.id,
      messages: msgs.map((m) => ({ fromMe: !!Number(m.is_sender), text: (m.text ?? "").trim(), ...labels(new Date(m.timestamp), ctx.account.timezone) })),
    });
  }
  const data: { threads: InboxThread[]; ownPremium?: boolean | null; ownPhoto?: { base64: string; type: string } | null } = { threads };
  if (opts.checkPremium) {
    const me = await ctx.client.me(ctx.accountId).catch(() => null);
    data.ownPremium = typeof me?.premium === "boolean" ? me.premium : null;
    data.ownPhoto = me?.profile_picture_url ? await ctx.client.download(me.profile_picture_url).catch(() => null) : null;
  }
  return { outcome: "DONE", data };
}
