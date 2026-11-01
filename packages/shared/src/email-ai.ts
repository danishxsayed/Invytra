import { z } from "zod";

/*
 * The AI email writer: a brief (what the campaign is for) and what to do with it.
 * The writing happens on the server (OpenAI); nothing it writes is sent without the
 * person choosing it, saving and launching.
 */

export const EMAIL_AI_TONES = ["professional", "friendly", "casual", "direct", "persuasive"] as const;
export const EMAIL_AI_LENGTHS = { short: "50–90 words", medium: "90–150 words", long: "150–220 words" } as const;
export type EmailAiLength = keyof typeof EMAIL_AI_LENGTHS;

export const emailBriefSchema = z.object({
  objective: z.string().trim().min(3, "What should this email achieve?").max(300),
  audience: z.string().trim().min(3, "Who is it for?").max(300),
  product: z.string().trim().min(3, "What do you offer?").max(1000),
  tone: z.enum(EMAIL_AI_TONES),
  sellingPoints: z.string().trim().max(1000),
  cta: z.string().trim().max(200),
  length: z.enum(["short", "medium", "long"]),
});
export type EmailBrief = z.infer<typeof emailBriefSchema>;

export const EMAIL_AI_ACTIONS = {
  generate: "Write the email",
  rewrite: "Rewrite",
  shorter: "Make it shorter",
  professional: "More professional",
  friendly: "More friendly",
  subject: "Improve the subject line",
  variations: "Variations",
} as const;
export type EmailAiAction = keyof typeof EMAIL_AI_ACTIONS;

export const emailAiRequestSchema = z
  .object({
    action: z.enum(Object.keys(EMAIL_AI_ACTIONS) as [EmailAiAction, ...EmailAiAction[]]),
    brief: emailBriefSchema.optional(),
    /** The email as it is now (for rewrites). */
    current: z.object({ subject: z.string().max(200), body: z.string().max(5000) }).optional(),
    /** 0 = the first email; later ones are follow-ups in the same thread. */
    step: z.number().int().min(0).max(7),
    /** The email before this one (for follow-ups). */
    previous: z.object({ subject: z.string().max(200), body: z.string().max(5000) }).optional(),
    /** Custom variables the workspace has (built-in ones are always allowed). */
    variables: z.array(z.string().max(40)).max(100),
    count: z.number().int().min(1).max(3),
  })
  .superRefine((r, ctx) => {
    if (r.action === "generate" && !r.brief) ctx.addIssue({ code: "custom", message: "Fill in the brief first." });
    if (r.action !== "generate" && !r.current?.body.trim()) ctx.addIssue({ code: "custom", message: "Write or generate the email first." });
  });
export type EmailAiRequest = z.infer<typeof emailAiRequestSchema>;

export interface EmailDraft {
  subject: string;
  /** The inbox preview line shown after the subject. */
  preview: string;
  body: string;
  /** The call to action in the body, for display. */
  cta: string;
}
