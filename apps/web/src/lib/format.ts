import { hideVendor } from "./vendor";
export const ACTION_LABEL: Record<string, string> = {
  PROFILE_VISIT: "Profile visit",
  CHECK_CONNECTION: "Connection check",
  CONNECTION_REQUEST: "Invite",
  MESSAGE: "Message",
  INBOX_SYNC: "Inbox check",
  SEARCH_PAGE: "Search import",
  LIKE_POST: "Like latest post",
  FOLLOW_PROFILE: "Follow profile",
  COMMENT_POST: "Like and comment",
  EVENT_INVITE: "Event invite",
  WITHDRAW_INVITE: "Withdraw invite",
  REPLY: "Reply from inbox",
};

/** "/in/jane-doe-123/" from a full LinkedIn URL. */
export function profilePath(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Human name guess from a profile slug: "/in/jane-doe-1a2b/" → "jane doe". */
export function slugName(url: string | null | undefined): string {
  const m = /\/in\/([^/]+)/.exec(profilePath(url));
  if (!m) return "";
  return m[1]!
    .split("-")
    .filter((p) => !/\d/.test(p))
    .join(" ");
}

export function timeAgo(date: Date | null | undefined, now = new Date()): string {
  if (!date) return "";
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const v =
    a < 60 ? "just now" : a < 3600 ? `${Math.floor(a / 60)} min` : a < 86400 ? `${Math.floor(a / 3600)} h` : `${Math.floor(a / 86400)} d`;
  if (v === "just now") return v;
  return future ? `in ${v}` : `${v} ago`;
}

/** One plain sentence about what happened to an action. */
export function outcomeText(row: { status: string; error: string | null; payload: unknown; type: string }): string {
  const p = (row.payload ?? {}) as { note?: string; result?: { withNote?: boolean; newReplies?: number; people?: unknown[] } };
  switch (row.status) {
    case "SUCCEEDED":
      if (row.type === "CONNECTION_REQUEST") {
        if (p.note && p.result?.withNote === false) return "Sent without note (free LinkedIn account)";
        return p.result?.withNote ? "Sent with note" : "Sent";
      }
      if (row.type === "SEARCH_PAGE") {
        const n = ((p.result as { people?: unknown[] } | undefined)?.people ?? []).length;
        return `${n} ${n === 1 ? "person" : "people"} found`;
      }
      if (row.type === "LIKE_POST") return "Liked";
      if (row.type === "FOLLOW_PROFILE") return "Followed";
      if (row.type === "COMMENT_POST") return "Commented";
      if (row.type === "EVENT_INVITE") return "Invited to the event";
      if (row.type === "WITHDRAW_INVITE") return "Withdrawn";
      if (row.type === "REPLY") return "Sent";
      if (row.type === "INBOX_SYNC") return p.result?.newReplies ? `${p.result.newReplies} new repl${p.result.newReplies === 1 ? "y" : "ies"}` : "No new replies";
      return "Done";
    case "SKIPPED":
      return skipText(row.error);
    case "FAILED":
      return hideVendor((row.error ?? "Failed").split("\n")[0]!);
    case "RUNNING":
      return "Running now";
    default:
      return row.error?.startsWith("waiting: ") ? waitText(row.error.slice(9)) : "Queued";
  }
}

function skipText(reason: string | null): string {
  const map: Record<string, string> = {
    PENDING: "Already invited",
    NO_POSTS: "No posts to like",
    ALREADY_LIKED: "Already liked",
    NOT_PENDING: "No pending invite",
    SEARCH_LIMIT: "LinkedIn's monthly search limit reached",
    NO_SALES_NAV: "No Sales Navigator on this account",
    CONNECTED: "Already connected",
    PROFILE_UNAVAILABLE: "Profile not found",
    EMAIL_REQUIRED: "LinkedIn asked for their email",
    CONNECT_NOT_AVAILABLE: "No Connect button on this profile",
    NOTE_LIMIT: "Skipped: note required, free notes used up",
    CANCELLED: "Cancelled",
    REPLIED: "They replied, so not sent",
    OUTSIDE_WORKING_HOURS: "Outside working hours",
    DAILY_LIMIT_REACHED: "Daily limit reached",
    WEEKLY_LIMIT_REACHED: "Weekly limit reached",
    ACCOUNT_NOT_ACTIVE: "Account not active",
  };
  if (!reason) return "Skipped";
  if (reason.startsWith("NOT_CONNECTED")) return "Not connected, so the message wasn't sent";
  return map[reason] ?? reason;
}

export function waitText(reason: string): string {
  if (reason.startsWith("RETRY")) return "Will retry";
  const map: Record<string, string> = {
    OUTSIDE_WORKING_HOURS: "Waiting for working hours",
    DAILY_LIMIT_REACHED: "Waiting: daily limit reached",
    WEEKLY_LIMIT_REACHED: "Waiting: weekly limit reached",
    ACCOUNT_NOT_ACTIVE: "Waiting: account not active",
    INVITES_PAUSED: "Waiting: LinkedIn invite limit",
    WAITING_INBOX_CHECK: "Checking the inbox for a reply first",
    ACCOUNT_BUSY: "Waiting for its turn",
    WAITING_TURN: "Waiting for its turn",
    PACING: "Waiting for its turn",
  };
  return map[reason] ?? "Queued";
}

/** "2:15 PM" today, "Oct 20" this year, "Oct 20, 2025" before, in a time zone. */
export function shortWhen(d: Date, timeZone: string, now = new Date()): string {
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone });
  if (day(d) === day(now)) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const sameYear = d.toLocaleDateString("en-US", { year: "numeric", timeZone }) === now.toLocaleDateString("en-US", { year: "numeric", timeZone });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone });
}

/** "Today", "Yesterday", "Monday 19 October" — day dividers in a conversation. */
export function dayLabel(d: Date, timeZone: string, now = new Date()): string {
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone });
  if (day(d) === day(now)) return "Today";
  if (day(d) === day(new Date(now.getTime() - 86400_000))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone });
}
