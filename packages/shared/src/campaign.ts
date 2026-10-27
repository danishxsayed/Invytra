import { z } from "zod";
import type { Degree } from "./audience.js";
import { outreachTextProblem } from "./text.js";

/*
 * A campaign is one LinkedIn account working through one lead list with a
 * sequence of steps. Each lead moves through the steps on its own clock.
 */

/** LinkedIn's limit for a connection note. */
export const NOTE_MAX = 300;
/** Free accounts are often held to 200 characters for notes. */
export const NOTE_FREE_MAX = 200;
export const MESSAGE_MAX = 2000;

const delay = z.number().int().min(0, "Days can't be negative").max(60, "Wait at most 60 days");

export const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("VISIT"), delayDays: delay }),
  /** Like their most recent post — a light touch before (or after) the invite. */
  z.object({ type: z.literal("LIKE_POST"), delayDays: delay }),
  /** Follow their profile — they get a notification, and you see their posts. */
  z.object({ type: z.literal("FOLLOW"), delayDays: delay }),
  z.object({ type: z.literal("INVITE"), delayDays: delay, note: z.string().max(NOTE_MAX, `Notes can be at most ${NOTE_MAX} characters`) }),
  z.object({ type: z.literal("MESSAGE"), delayDays: delay, text: z.string().max(MESSAGE_MAX, `Messages can be at most ${MESSAGE_MAX} characters`) }),
]);
export type CampaignStep = z.infer<typeof stepSchema>;

/** How many of each step a sequence may have. */
export const MAX_OF = { VISIT: 3, LIKE_POST: 2, FOLLOW: 1, INVITE: 1 } as const;
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
  if (steps.length && !steps.some((s) => s.type === "INVITE" || s.type === "MESSAGE")) out.push("Add an invite or a message.");
  steps.forEach((s, i) => {
    const n = i + 1;
    if (s.type === "MESSAGE") {
      if (!s.text.trim()) out.push(`Step ${n}: write the message.`);
      else {
        const p = outreachTextProblem(s.text);
        if (p) out.push(`Step ${n}: the message ${p}.`);
      }
    }
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
