import { AUDIENCE_SKIP } from "./audience.js";
import type { CampaignSettings, CampaignStep } from "./campaign.js";

/**
 * How one lead moves through a campaign. Pure functions: the worker's engine
 * reads the lead, asks what to do next, runs it through the normal queue
 * (limits, hours, pacing) and feeds the result back here.
 */

export type LeadState =
  | "QUEUED" // not started yet
  | "IN_PROGRESS" // working through the steps
  | "WAITING_ACCEPT" // invite sent; checking now and then whether they accepted
  | "DONE" // every step done
  | "REPLIED" // they wrote back — nothing more is sent
  | "NOT_ACCEPTED" // invite not accepted in time, or withdrawn
  | "SKIPPED" // not contacted (already contacted, profile gone, …)
  | "FAILED"; // something went wrong; see reason

export const ACTIVE_STATES: LeadState[] = ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"];

export interface FlowLead {
  state: LeadState;
  /** Index of the next step to run. */
  step: number;
  invitedAt: Date | null;
  connectedAt: Date | null;
  /** WITHDRAW = the invite expired and is waiting to be withdrawn. */
  reason?: string | null;
}

/** Reason on a WAITING_ACCEPT lead whose expired invite is about to be withdrawn. */
export const WITHDRAW_PENDING = "WITHDRAW";

export type PlannedAction =
  | { type: "PROFILE_VISIT" }
  | { type: "LIKE_POST" }
  | { type: "FOLLOW_PROFILE" }
  | { type: "COMMENT_POST"; text: string }
  | { type: "EVENT_INVITE"; eventUrl: string }
  | { type: "WITHDRAW_INVITE" }
  | { type: "CONNECTION_REQUEST"; note: string }
  | { type: "MESSAGE"; text: string }
  | { type: "CHECK_CONNECTION" };

/** What the lead needs next, or null if nothing (finished or stopped). */
export function plannedAction(steps: CampaignStep[], lead: FlowLead): PlannedAction | null {
  if (lead.state === "WAITING_ACCEPT") return lead.reason === WITHDRAW_PENDING ? { type: "WITHDRAW_INVITE" } : { type: "CHECK_CONNECTION" };
  if (lead.state !== "QUEUED" && lead.state !== "IN_PROGRESS") return null;
  const s = steps[lead.step];
  if (!s) return null;
  switch (s.type) {
    case "VISIT":
      return { type: "PROFILE_VISIT" };
    case "LIKE_POST":
      return { type: "LIKE_POST" };
    case "FOLLOW":
      return { type: "FOLLOW_PROFILE" };
    case "COMMENT":
      return { type: "COMMENT_POST", text: s.text.trim() };
    case "EVENT":
      return { type: "EVENT_INVITE", eventUrl: s.eventUrl.trim() };
    case "INVITE":
      return { type: "CONNECTION_REQUEST", note: s.note.trim() };
    case "MESSAGE":
      return { type: "MESSAGE", text: s.text.trim() };
  }
}

export interface ActionResult {
  type: "PROFILE_VISIT" | "CONNECTION_REQUEST" | "MESSAGE" | "CHECK_CONNECTION" | "LIKE_POST" | "WITHDRAW_INVITE" | "FOLLOW_PROFILE" | "COMMENT_POST" | "EVENT_INVITE";
  status: "SUCCEEDED" | "SKIPPED" | "FAILED";
  /** Skip reason or error text from the action row. */
  error: string | null;
  /** For connection checks and skips: what LinkedIn showed. */
  connection?: "CONNECTED" | "PENDING" | "NOT_CONNECTED" | "UNAVAILABLE";
}

export interface LeadUpdate {
  state: LeadState;
  step: number;
  nextAt: Date | null;
  invitedAt?: Date;
  connectedAt?: Date;
  /** Reason code for SKIPPED / FAILED / NOT_ACCEPTED (shown in plain words by the dashboard). */
  reason?: string | null;
}

type Random = () => number;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** `days` later plus a little randomness, so leads don't move in lockstep. 0 days = within the hour. */
export function afterDays(now: Date, days: number, random: Random = Math.random): Date {
  const jitter = days === 0 ? (5 + random() * 50) * 60_000 : random() * 3 * HOUR;
  return new Date(now.getTime() + days * DAY + jitter);
}

/** Next look at a pending invite: about once a day (20–30 h), so checks spread out. */
export function nextCheckAt(now: Date, random: Random = Math.random): Date {
  return new Date(now.getTime() + (20 + random() * 10) * HOUR);
}

const stop = (state: LeadState, lead: FlowLead, reason: string): LeadUpdate => ({ state, step: lead.step, nextAt: null, reason });

/** Moves past the step just finished. */
function advance(steps: CampaignStep[], lead: FlowLead, now: Date, random: Random, extra: Partial<LeadUpdate> = {}): LeadUpdate {
  const step = lead.step + 1;
  const next = steps[step];
  if (!next) return { state: "DONE", step, nextAt: null, reason: null, ...extra };
  return { state: "IN_PROGRESS", step, nextAt: afterDays(now, next.delayDays, random), reason: null, ...extra };
}

/** They're connected: continue with the steps after the invite. */
function connected(steps: CampaignStep[], lead: FlowLead, now: Date, random: Random): LeadUpdate {
  const next = steps[lead.step];
  if (!next) return { state: "DONE", step: lead.step, nextAt: null, connectedAt: now, reason: null };
  return { state: "IN_PROGRESS", step: lead.step, nextAt: afterDays(now, next.delayDays, random), connectedAt: now, reason: null };
}

function expired(lead: FlowLead, settings: CampaignSettings, now: Date): boolean {
  return !!lead.invitedAt && now.getTime() - lead.invitedAt.getTime() > settings.acceptWithinDays * DAY;
}

const PERMANENT_SKIPS = new Set(["PROFILE_UNAVAILABLE", "EMAIL_REQUIRED", "CONNECT_NOT_AVAILABLE", "NOTE_LIMIT", "MISSING_DETAIL"]);

/** Applies a finished action's result to the lead. */
export function applyResult(
  steps: CampaignStep[],
  settings: CampaignSettings,
  lead: FlowLead,
  r: ActionResult,
  now: Date,
  random: Random = Math.random,
): LeadUpdate {
  const reason = (r.error ?? "").split("\n")[0]!.trim();
  // Someone stopped it (campaign paused, or the action was cancelled): try the same step again later.
  if (r.status === "SKIPPED" && reason === "CANCELLED") return { state: lead.state, step: lead.step, nextAt: now };
  // Outside the campaign's audience (connection level / Premium), found when their profile was opened.
  if (r.status === "SKIPPED" && reason.startsWith(`${AUDIENCE_SKIP}:`)) return stop("SKIPPED", lead, reason);

  switch (r.type) {
    case "PROFILE_VISIT":
      if (r.status === "SUCCEEDED") return advance(steps, lead, now, random);
      if (r.status === "SKIPPED") return stop("SKIPPED", lead, reason || "PROFILE_UNAVAILABLE");
      return stop("FAILED", lead, reason || "FAILED");

    case "CONNECTION_REQUEST": {
      if (r.status === "SUCCEEDED") {
        return { state: "WAITING_ACCEPT", step: lead.step + 1, nextAt: nextCheckAt(now, random), invitedAt: now, reason: null };
      }
      if (r.status === "SKIPPED") {
        if (reason === "CONNECTED") return connected(steps, { ...lead, step: lead.step + 1 }, now, random);
        if (reason === "PENDING") {
          // Invited before (by hand, or by another tool): wait for it like our own invite.
          return { state: "WAITING_ACCEPT", step: lead.step + 1, nextAt: nextCheckAt(now, random), invitedAt: now, reason: null };
        }
        return stop("SKIPPED", lead, reason || "SKIPPED");
      }
      // LinkedIn's weekly invite limit: the worker pauses invites; try this lead again later.
      if (reason === "WEEKLY_INVITE_LIMIT") return { state: lead.state, step: lead.step, nextAt: new Date(now.getTime() + 3 * DAY) };
      return stop("FAILED", lead, reason || "FAILED");
    }

    case "CHECK_CONNECTION": {
      if (r.status === "SUCCEEDED" && r.connection === "CONNECTED") return connected(steps, lead, now, random);
      if (r.status === "SUCCEEDED" && r.connection === "NOT_CONNECTED") return stop("NOT_ACCEPTED", lead, "WITHDRAWN");
      if (r.status === "SUCCEEDED" && r.connection === "UNAVAILABLE") return stop("SKIPPED", lead, "PROFILE_UNAVAILABLE");
      if (r.status === "SKIPPED" && PERMANENT_SKIPS.has(reason)) return stop("SKIPPED", lead, reason);
      // Still pending (or the check itself failed): look again tomorrow, until the window closes.
      if (expired(lead, settings, now)) {
        // Withdraw it first (soon, not tomorrow), then the lead ends as not accepted.
        if (settings.withdrawExpired) return { state: "WAITING_ACCEPT", step: lead.step, nextAt: afterDays(now, 0, random), reason: WITHDRAW_PENDING };
        return stop("NOT_ACCEPTED", lead, "EXPIRED");
      }
      return { state: "WAITING_ACCEPT", step: lead.step, nextAt: nextCheckAt(now, random) };
    }

    case "LIKE_POST":
    case "FOLLOW_PROFILE":
    case "COMMENT_POST":
    case "EVENT_INVITE":
      // A like or follow is a nice touch, never a reason to stop: no posts, already done or a hiccup all move on.
      if (r.status === "SKIPPED" && reason === "PROFILE_UNAVAILABLE") return stop("SKIPPED", lead, reason);
      return advance(steps, lead, now, random);

    case "WITHDRAW_INVITE":
      // They accepted just in time: carry on with the steps after the invite.
      if (r.status === "SKIPPED" && reason === "CONNECTED") return connected(steps, lead, now, random);
      if (r.status === "SUCCEEDED") return stop("NOT_ACCEPTED", lead, "EXPIRED_WITHDRAWN");
      // Nothing to withdraw any more, or it failed: don't retry forever.
      return stop("NOT_ACCEPTED", lead, "EXPIRED");

    case "MESSAGE":
      if (r.status === "SUCCEEDED") return advance(steps, lead, now, random);
      if (r.status === "SKIPPED") return stop("SKIPPED", lead, reason.startsWith("NOT_CONNECTED") ? "NOT_CONNECTED" : reason || "SKIPPED");
      // Messages are never retried — a retry could send it twice.
      return stop("FAILED", lead, reason || "FAILED");
  }
}

/** Normalises a person's name for reply matching ("Jane  Doé 🚀" → "jane doé"). */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
