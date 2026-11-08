import { cardSchema, unsignedCard } from "./card.js";
import { scriptHasLink, voiceNoteSchema } from "./voice.js";
import { z } from "zod";
import type { Degree } from "./audience.js";
import { outreachTextProblem } from "./text.js";
import { DEFAULT_AI_SETTINGS, aiSettingsSchema } from "./ai.js";

/*
 * A campaign is one LinkedIn account working through one lead list with a
 * sequence of steps. Each lead moves through the steps on its own clock.
 */

/** LinkedIn's limit for a connection note. */
export const NOTE_MAX = 300;
/** Free accounts are often held to 200 characters for notes. */
export const NOTE_FREE_MAX = 200;
export const MESSAGE_MAX = 2000;
/** Keep comments short: they're public, under someone else's post. */
export const COMMENT_MAX = 500;

/** A LinkedIn event link → canonical "https://www.linkedin.com/events/<id>/", or null. */
export function eventUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = /^\/events\/([A-Za-z0-9_-]+)\/?/.exec(u.pathname);
    return m ? `https://www.linkedin.com/events/${m[1]}/` : null;
  } catch {
    return null;
  }
}

const delay = z.number().int().min(0, "Days can't be negative").max(60, "Wait at most 60 days");

export const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("VISIT"), delayDays: delay }),
  /** Like their most recent post — a light touch before (or after) the invite. */
  z.object({ type: z.literal("LIKE_POST"), delayDays: delay }),
  /** Follow their profile — they get a notification, and you see their posts. */
  z.object({ type: z.literal("FOLLOW"), delayDays: delay }),
  /** Like their latest post and leave a comment on it. */
  z.object({ type: z.literal("COMMENT"), delayDays: delay, text: z.string().max(COMMENT_MAX, `Comments can be at most ${COMMENT_MAX} characters`) }),
  /** Invite a connection to one of your LinkedIn events. */
  z.object({ type: z.literal("EVENT"), delayDays: delay, eventUrl: z.string().max(300) }),
  /** aiWrite: AI writes the note for each person from their profile, using the note as its guide. */
  z.object({ type: z.literal("INVITE"), delayDays: delay, note: z.string().max(NOTE_MAX, `Notes can be at most ${NOTE_MAX} characters`), aiWrite: z.boolean().optional() }),
  /** card: a handwritten note image sent with the message (2 AI credits each). voice: a voice note in the customer's voice (5 each). */
  z.object({
    type: z.literal("MESSAGE"),
    delayDays: delay,
    text: z.string().max(MESSAGE_MAX, `Messages can be at most ${MESSAGE_MAX} characters`),
    aiWrite: z.boolean().optional(),
    card: cardSchema.optional(),
    voice: voiceNoteSchema.optional(),
  }),
]);
export type CampaignStep = z.infer<typeof stepSchema>;

/** How many of each step a sequence may have. */
export const MAX_OF = { VISIT: 3, LIKE_POST: 2, FOLLOW: 1, INVITE: 1, COMMENT: 2, EVENT: 2 } as const;
export const MAX_STEPS = 10;

/** Problems that make a sequence unusable, in plain words (empty = fine). */
export function sequenceProblems(steps: CampaignStep[]): string[] {
  const out: string[] = [];
  const count = (t: CampaignStep["type"]) => steps.filter((s) => s.type === t).length;
  if (steps.length === 0) out.push("Add at least one step.");
  if (count("INVITE") > 1) out.push("Use only one invite step.");
  if (count("VISIT") > MAX_OF.VISIT) out.push(`Use at most ${MAX_OF.VISIT} profile visit steps.`);
  if (count("LIKE_POST") > MAX_OF.LIKE_POST) out.push(`Use at most ${MAX_OF.LIKE_POST} “like their latest post” steps.`);
  if (count("FOLLOW") > MAX_OF.FOLLOW) out.push("Use only one follow step.");
  if (count("COMMENT") > MAX_OF.COMMENT) out.push(`Use at most ${MAX_OF.COMMENT} comment steps.`);
  if (count("EVENT") > MAX_OF.EVENT) out.push(`Use at most ${MAX_OF.EVENT} event invite steps.`);
  if (steps.length && !steps.some((s) => s.type === "INVITE" || s.type === "MESSAGE")) out.push("Add an invite or a message.");
  steps.forEach((s, i) => {
    const n = i + 1;
    if (s.type === "MESSAGE") {
      if (s.voice) {
        if (!s.voice.voiceId) out.push(`Step ${n}: pick the voice for the voice note.`);
        if (!s.voice.script.trim()) out.push(`Step ${n}: write what the voice note says.`);
        else {
          const p = outreachTextProblem(s.voice.script);
          if (p) out.push(`Step ${n}: the voice note ${p}.`);
          else if (scriptHasLink(s.voice.script)) out.push(`Step ${n}: links don't work in a voice note; put the link in the message instead.`);
        }
      }
      if (s.card && !s.card.text.trim()) out.push(`Step ${n}: write what the handwritten note says.`);
      else if (s.card) {
        const p = outreachTextProblem(s.card.text);
        if (p) out.push(`Step ${n}: the handwritten note ${p}.`);
        else if (unsignedCard(s.card.text)) out.push(`Step ${n}: sign the handwritten note with your name (it still says "Your name").`);
      }
      if (!s.text.trim()) {
        if (!s.aiWrite && !s.card && !s.voice) out.push(`Step ${n}: write the message.`);
      } else {
        const p = outreachTextProblem(s.text);
        if (p) out.push(`Step ${n}: the message ${p}.`);
      }
    }
    if (s.type === "COMMENT") {
      if (!s.text.trim()) out.push(`Step ${n}: write the comment.`);
      else {
        const p = outreachTextProblem(s.text);
        if (p) out.push(`Step ${n}: the comment ${p}.`);
      }
    }
    if (s.type === "EVENT" && !eventUrl(s.eventUrl)) out.push(`Step ${n}: paste the link to your LinkedIn event (linkedin.com/events/…).`);
    if (s.type === "INVITE" && s.note.trim()) {
      const p = outreachTextProblem(s.note);
      if (p) out.push(`Step ${n}: the note ${p}.`);
    }
  });
  return out;
}

export const sequenceSchema = z
  .array(stepSchema)
  .max(10, "Use at most 10 steps")
  .superRefine((steps, ctx) => {
    for (const message of sequenceProblems(steps)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const campaignSettingsSchema = z.object({
  /** Give up on an invite that hasn't been accepted after this many days. */
  acceptWithinDays: z.number().int().min(3).max(60).default(21),
  /**
   * Days this campaign sends on (ISO: 1 = Monday … 7 = Sunday), in each sender's own
   * time zone. Hours, limits and pacing still come from each sender account.
   */
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Pick at least one day to send on.")
    .transform((d) => [...new Set(d)].sort((a, b) => a - b))
    .default([...WEEKDAYS]),
  /** Don't start before this moment (ISO). Null = as soon as it's launched. */
  startAt: z.string().datetime().nullable().default(null),
  /**
   * When an invite isn't accepted within acceptWithinDays, withdraw it. Pending
   * invites count toward LinkedIn's limits; withdrawing frees room. (LinkedIn then
   * blocks re-inviting that person for about three weeks.)
   */
  withdrawExpired: z.boolean().default(true),
  /**
   * Who to include, by connection degree (1 = 1st, 2 = 2nd, 3 = 3rd and beyond). Anyone
   * whose degree is known and not listed is skipped before they are contacted.
   * Default (older campaigns): everyone.
   */
  degrees: z
    .array(z.union([z.literal(1), z.literal(2), z.literal(3)]))
    .min(1, "Pick at least one connection level.")
    .transform((d) => [...new Set(d)].sort() as Degree[])
    .default([1, 2, 3]),
  /** Only contact people with a LinkedIn Premium badge. */
  premiumOnly: z.boolean().default(false),
  /** Skip people who are already in another of the workspace's campaigns. */
  skipOtherCampaigns: z.boolean().default(true),
  /**
   * When the campaign's list is being collected from a search: read the whole search in one
   * go (up to FETCH_ALL_SEARCH_PAGES_PER_DAY pages a day) instead of SEARCH_PAGES_PER_DAY.
   */
  fetchAllAtOnce: z.boolean().default(false),
  /** AI personalisation for {aiLine}. */
  ai: aiSettingsSchema.default(DEFAULT_AI_SETTINGS),
});
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;
export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  acceptWithinDays: 21,
  days: [...WEEKDAYS],
  startAt: null,
  withdrawExpired: true,
  degrees: [1, 2, 3],
  premiumOnly: false,
  skipOtherCampaigns: true,
  fetchAllAtOnce: false,
  ai: DEFAULT_AI_SETTINGS,
};

/** Whether a launched campaign is still waiting for its start date. */
export function waitingToStart(settings: Pick<CampaignSettings, "startAt">, now: Date): boolean {
  return !!settings.startAt && new Date(settings.startAt) > now;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** "Every day", "Mon–Fri", "Mon–Sat", "Sat, Sun", "Mon, Wed, Fri". */
export function daysText(days: readonly number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return "Every day";
  const run = d.length >= 3 && d[d.length - 1]! - d[0]! === d.length - 1;
  if (run) return `${DAY_SHORT[d[0]! - 1]}–${DAY_SHORT[d[d.length - 1]! - 1]}`;
  return d.map((x) => DAY_SHORT[x - 1]).join(", ");
}

/** Starting points in the builder. Texts are left for the person to write — never send generic copy. */
export const SEQUENCE_PRESETS = {
  invite_followups: {
    label: "Invite + follow-ups",
    hint: "Visit, invite, then message after they accept.",
    steps: [
      { type: "VISIT", delayDays: 0 },
      { type: "INVITE", delayDays: 1, note: "" },
      { type: "MESSAGE", delayDays: 1, text: "" },
      { type: "MESSAGE", delayDays: 4, text: "" },
    ],
  },
  invite_only: {
    label: "Invite only",
    hint: "Visit their profile, then send an invite.",
    steps: [
      { type: "VISIT", delayDays: 0 },
      { type: "INVITE", delayDays: 1, note: "" },
    ],
  },
  message_connections: {
    label: "Message connections",
    hint: "For people you're already connected with.",
    steps: [
      { type: "MESSAGE", delayDays: 0, text: "" },
      { type: "MESSAGE", delayDays: 4, text: "" },
    ],
  },
} satisfies Record<string, { label: string; hint: string; steps: CampaignStep[] }>;
export type SequencePreset = keyof typeof SEQUENCE_PRESETS;

export const hasInvite = (steps: CampaignStep[]) => steps.some((s) => s.type === "INVITE");
