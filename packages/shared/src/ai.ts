import { z } from "zod";
import type { CampaignStep } from "./campaign.js";

/*
 * AI personalisation: the {aiLine} placeholder. When a note or message with it goes out, AI
 * reads the person's LinkedIn profile (headline, About, experience, education, skills,
 * recent posts, hiring signals) and writes one line about the strongest thing it finds.
 */

export const AI_TONES = ["friendly", "professional", "casual"] as const;
export type AiTone = (typeof AI_TONES)[number];

export const aiSettingsSchema = z.object({
  /** What the sender offers, so the line can lead into it. */
  offer: z.string().trim().max(400).default(""),
  tone: z.enum(AI_TONES).default("friendly"),
  /** Used when the profile has nothing worth mentioning (or AI isn't available). Empty = skip that person. */
  fallback: z.string().trim().max(200).default(""),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
export const DEFAULT_AI_SETTINGS: AiSettings = { offer: "", tone: "friendly", fallback: "" };

/** Where the line came from, strongest first. */
export const AI_SIGNALS = ["hiring", "post", "role", "headline", "about", "education", "skills"] as const;
export type AiSignal = (typeof AI_SIGNALS)[number];
export const AI_SIGNAL_LABEL: Record<AiSignal, string> = {
  hiring: "Hiring signal",
  post: "Recent post",
  role: "Current role",
  headline: "Headline",
  about: "About section",
  education: "Education",
  skills: "Skills",
};

const textOf = (s: CampaignStep) => (s.type === "INVITE" ? s.note : s.type === "MESSAGE" || s.type === "COMMENT" ? s.text : "");

/** Whether any note, message or comment of the sequence uses {aiLine}. */
export function usesAiLine(steps: CampaignStep[]): boolean {
  return steps.some((s) => textOf(s).includes("{aiLine}"));
}

/** Problems with AI personalisation for this sequence (empty = fine). */
export function aiProblems(steps: CampaignStep[], ai: AiSettings): string[] {
  if (!usesAiLine(steps)) return [];
  return ai.offer.trim() ? [] : ["Your messages use {aiLine}: describe what you offer in Configure → AI personalisation."];
}

/**
 * The longest AI line that still fits: a connection note must stay within LinkedIn's limit
 * once {aiLine} is filled in (other placeholders are allowed for at about 30 characters).
 */
export function aiLineMaxChars(template: string, limit: number): number {
  const rest = template.replace("{aiLine}", "").replace(/\{(firstName|lastName|name|company|title)\}/g, "x".repeat(30)).length;
  return Math.max(60, Math.min(220, limit - rest));
}
