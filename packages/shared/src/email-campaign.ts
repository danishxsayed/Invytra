import { cardSchema, unsignedCard } from "./card.js";
import { z } from "zod";

/*
 * Email campaigns: the sequence of emails (variables: email-vars.ts; contacts: email-contacts.ts).
 */

export const EMAIL_CAMPAIGN = {
  maxSteps: 8,
  maxDelayDays: 30,
  subjectMax: 200,
  bodyMax: 5000,
} as const;

// ---------------------------------------------------------------- sequence

export const emailStepSchema = z.object({
  /** Empty on a follow-up = a reply in the same thread ("Re: <first subject>"). */
  subject: z.string().max(EMAIL_CAMPAIGN.subjectMax).transform((s) => s.trim()),
  body: z.string().max(EMAIL_CAMPAIGN.bodyMax),
  /** Days after the previous email (the first email: 0 = as soon as sending allows). */
  delayDays: z.number().int().min(0).max(EMAIL_CAMPAIGN.maxDelayDays),
  /** Preview text: the line inboxes show after the subject (optional). */
  preview: z.string().max(150).optional(),
  /** A handwritten card shown in the email (2 AI credits each). */
  card: cardSchema.optional(),
});
export type EmailStep = z.infer<typeof emailStepSchema>;

export const emailSequenceSchema = z
  .array(emailStepSchema)
  .min(1, "Add at least one email.")
  .max(EMAIL_CAMPAIGN.maxSteps, `At most ${EMAIL_CAMPAIGN.maxSteps} emails in a sequence.`)
  .superRefine((steps, ctx) => {
    steps.forEach((s, i) => {
      if (i === 0 && !s.subject) ctx.addIssue({ code: "custom", message: "The first email needs a subject.", path: [i, "subject"] });
      if (!s.body.trim()) ctx.addIssue({ code: "custom", message: `Email ${i + 1} has no text.`, path: [i, "body"] });
      if (s.card && !s.card.text.trim()) ctx.addIssue({ code: "custom", message: `Email ${i + 1}: write what the handwritten note says.`, path: [i, "card"] });
      else if (s.card && unsignedCard(s.card.text)) ctx.addIssue({ code: "custom", message: `Email ${i + 1}: sign the handwritten note with your name (it still says "Your name").`, path: [i, "card"] });
      if (i > 0 && s.delayDays < 1) ctx.addIssue({ code: "custom", message: `Email ${i + 1}: wait at least 1 day after the previous email.`, path: [i, "delayDays"] });
    });
  });

export const DEFAULT_EMAIL_SEQUENCE: EmailStep[] = [
  { subject: "Quick question, {{first_name|there}}", body: "{{random:Hi|Hello}} {{first_name|there}},\n\n", delayDays: 0 },
  { subject: "", body: "{{random:Hi|Hey}} {{first_name|there}}, just bringing this back to the top of your inbox.\n\n", delayDays: 3 },
];

