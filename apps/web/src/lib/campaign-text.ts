import type { CampaignStep } from "@invytra/shared";

/** Plain-language labels for campaigns (safe to use in client components). */

export const LEAD_STATE: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: "Not started", cls: "bg-stone-100 text-stone-600" },
  IN_PROGRESS: { label: "In progress", cls: "bg-sky-50 text-sky-700" },
  WAITING_ACCEPT: { label: "Invite sent", cls: "bg-brand-100 text-brand-800" },
  DONE: { label: "Sequence done", cls: "bg-teal-50 text-teal-700" },
  REPLIED: { label: "Replied", cls: "bg-emerald-100 text-emerald-800" },
  NOT_ACCEPTED: { label: "Didn't accept", cls: "bg-amber-50 text-amber-700" },
  SKIPPED: { label: "Skipped", cls: "bg-stone-100 text-stone-500" },
  FAILED: { label: "Failed", cls: "bg-rose-50 text-rose-700" },
  PAUSED: { label: "Paused by you", cls: "bg-amber-50 text-amber-700" },
};

export const CAMPAIGN_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  DRAFT: { label: "Draft", cls: "bg-stone-100 text-stone-600 ring-stone-500/15", dot: "bg-stone-400" },
  ACTIVE: { label: "Running", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  SCHEDULED: { label: "Scheduled", cls: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500" },
  PAUSED: { label: "Paused", cls: "bg-amber-50 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
};

const REASONS: Record<string, string> = {
  ALREADY_CONTACTED: "Already invited or messaged by one of your accounts",
  IN_OTHER_CAMPAIGN: "Already in another campaign",
  PROFILE_UNAVAILABLE: "Profile not found",
  EMAIL_REQUIRED: "LinkedIn asked for their email to connect",
  CONNECT_NOT_AVAILABLE: "No Connect option on their profile",
  NOTE_LIMIT: "Free invite notes used up for this month",
  NOT_CONNECTED: "Not connected, so no message was sent",
  MISSING_DETAIL: "A placeholder had no value for this person",
  EXPIRED: "Didn't accept in time",
  WITHDRAWN: "Invite was withdrawn or declined",
  CANCELLED: "Cancelled",
  EXPIRED_WITHDRAWN: "Didn't accept in time, invite withdrawn",
  NO_POSTS: "Hasn't posted anything to like",
  FOLLOW_NOT_AVAILABLE: "No Follow option on their profile",
  ALREADY_FOLLOWING: "Already followed",
  COMMENT_NOT_AVAILABLE: "Their latest post doesn't allow comments",
  EVENT_NOT_FOUND: "The event link doesn't open an event",
  EVENT_NO_INVITE: "No Invite button on the event (only the organiser can invite)",
  NOT_IN_CONNECTIONS: "Not found among your connections for the event invite",
  ALREADY_INVITED: "Already invited to the event",
  SENDER_REMOVED: "Its sending account was removed from the campaign after contacting them",
  NO_AI_LINE: "Nothing specific for the AI line in their profile, and no fallback line",
  NOT_AVAILABLE_UNIPILE: "Not available for accounts connected through Unipile",
};

export function reasonText(code: string | null | undefined): string {
  if (!code) return "";
  if (code.startsWith("MISSING_DETAIL:")) return `No {${code.slice(15)}} in your list for this person`;
  if (code === "AUDIENCE:NOT_PREMIUM") return "Not a Premium member (this campaign is Premium only)";
  if (code.startsWith("AUDIENCE:DEGREE_")) {
    const d = code.slice(16);
    return `${d === "1" ? "1st" : d === "2" ? "2nd" : "3rd+"}-degree connection, not in this campaign's connection levels`;
  }
  return REASONS[code] ?? code.split("\n")[0]!;
}

export function stepLabel(s: CampaignStep | undefined): string {
  if (!s) return "";
  if (s.type === "LIKE_POST") return "Like latest post";
  if (s.type === "FOLLOW") return "Follow profile";
  if (s.type === "COMMENT") return "Like and comment";
  if (s.type === "EVENT") return "Invite to event";
  return s.type === "VISIT" ? "Visit profile" : s.type === "INVITE" ? (s.note.trim() ? "Invite with note" : "Invite") : "Message";
}

/** "Step 3 of 4 · Message" for where a lead is now. */
export function positionText(steps: CampaignStep[], state: string, step: number, reason?: string | null): string {
  if (state === "WAITING_ACCEPT") return reason === "WITHDRAW" ? "Didn't accept in time, withdrawing the invite" : "Waiting for them to accept";
  if (state === "QUEUED") return steps[0] ? `Next: ${stepLabel(steps[0]).toLowerCase()}` : "";
  if (state !== "IN_PROGRESS") return "";
  return steps[step] ? `Step ${step + 1} of ${steps.length} · ${stepLabel(steps[step])}` : "";
}

export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** "Monday 26 October", in the given time zone (the sender's) or the viewer's own. */
export function startText(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...(timeZone && { timeZone }) });
}

/** "Progress 2/4 · Invite sent" for a lead in the inbox. */
export function progressText(lead: { state: string; step: number; campaign: { steps: unknown } }): string {
  const n = Array.isArray(lead.campaign.steps) ? lead.campaign.steps.length : 0;
  return `${Math.min(lead.step, n)}/${n} · ${LEAD_STATE[lead.state]?.label ?? lead.state}`;
}
