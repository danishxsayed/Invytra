export const ACTION_LABEL: Record<string, string> = {
  PROFILE_VISIT: "Profile visit",
  CHECK_CONNECTION: "Connection check",
  CONNECTION_REQUEST: "Invite",
  MESSAGE: "Message",
  INBOX_SYNC: "Inbox check",
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
  const p = (row.payload ?? {}) as { note?: string; result?: { withNote?: boolean; newReplies?: number } };
  switch (row.status) {
    case "SUCCEEDED":
      if (row.type === "CONNECTION_REQUEST") {
        if (p.note && p.result?.withNote === false) return "Sent without note — LinkedIn's free-note limit";
        return p.result?.withNote ? "Sent with note" : "Sent";
      }
      if (row.type === "INBOX_SYNC") return p.result?.newReplies ? `${p.result.newReplies} new repl${p.result.newReplies === 1 ? "y" : "ies"}` : "No new replies";
      return "Done";
    case "SKIPPED":
      return skipText(row.error);
    case "FAILED":
      return (row.error ?? "Failed").split("\n")[0]!;
    case "RUNNING":
      return "Running now";
    default:
      return row.error?.startsWith("waiting: ") ? waitText(row.error.slice(9)) : "Queued";
  }
}

function skipText(reason: string | null): string {
  const map: Record<string, string> = {
    PENDING: "Already invited",
    CONNECTED: "Already connected",
    PROFILE_UNAVAILABLE: "Profile not found",
    EMAIL_REQUIRED: "LinkedIn asked for their email",
    CONNECT_NOT_AVAILABLE: "No Connect button on this profile",
    NOTE_LIMIT: "Skipped — note required, free notes used up",
    CANCELLED: "Cancelled",
    OUTSIDE_WORKING_HOURS: "Outside working hours",
    DAILY_LIMIT_REACHED: "Daily limit reached",
    WEEKLY_LIMIT_REACHED: "Weekly limit reached",
    ACCOUNT_NOT_ACTIVE: "Account not active",
  };
  if (!reason) return "Skipped";
  if (reason.startsWith("NOT_CONNECTED")) return "Not connected — message not sent";
  return map[reason] ?? reason;
}

function waitText(reason: string): string {
  if (reason.startsWith("RETRY")) return "Will retry";
  const map: Record<string, string> = {
    OUTSIDE_WORKING_HOURS: "Waiting for working hours",
    DAILY_LIMIT_REACHED: "Waiting — daily limit reached",
    WEEKLY_LIMIT_REACHED: "Waiting — weekly limit reached",
    ACCOUNT_NOT_ACTIVE: "Waiting — account not active",
    INVITES_PAUSED: "Waiting — LinkedIn invite limit",
    ACCOUNT_BUSY: "Waiting for its turn",
    WAITING_TURN: "Waiting for its turn",
    PACING: "Waiting for its turn",
  };
  return map[reason] ?? "Queued";
}
