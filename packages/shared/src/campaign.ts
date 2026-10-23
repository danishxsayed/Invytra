import { z } from "zod";
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
  z.object({ type: z.literal("INVITE"), delayDays: delay, note: z.string().max(NOTE_MAX, `Notes can be at most ${NOTE_MAX} characters`) }),
  z.object({ type: z.literal("MESSAGE"), delayDays: delay, text: z.string().max(MESSAGE_MAX, `Messages can be at most ${MESSAGE_MAX} characters`) }),
]);
export type CampaignStep = z.infer<typeof stepSchema>;

/** Problems that make a sequence unusable, in plain words (empty = fine). */
export function sequenceProblems(steps: CampaignStep[]): string[] {
  const out: string[] = [];
  const count = (t: CampaignStep["type"]) => steps.filter((s) => s.type === t).length;
  if (steps.length === 0) out.push("Add at least one step.");
  if (count("INVITE") > 1) out.push("Use only one invite step.");
  if (count("VISIT") > 1) out.push("Use only one profile visit step.");
  const invite = steps.findIndex((s) => s.type === "INVITE");
  const visit = steps.findIndex((s) => s.type === "VISIT");
  if (invite !== -1 && visit > invite) out.push("Put the profile visit before the invite.");
  if (steps.length && !steps.some((s) => s.type !== "VISIT")) out.push("Add an invite or a message.");
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

export const campaignSettingsSchema = z.object({
  /** Give up on an invite that hasn't been accepted after this many days. */
  acceptWithinDays: z.number().int().min(3).max(60).default(21),
});
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;
export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = { acceptWithinDays: 21 };

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
