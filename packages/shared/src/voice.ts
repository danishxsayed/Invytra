import { z } from "zod";

/*
 * Voice notes on LinkedIn message steps: a short script read in the customer's own (copied)
 * voice for each person, their name filled in. 10 AI credits each.
 */

/** About 45 seconds of speech (LinkedIn voice messages can be up to a minute). */
export const VOICE_SCRIPT_MAX = 600;
/** Voice copies per workspace. */
export const VOICES_MAX = 3;
/** The recording a voice is copied from. */
export const VOICE_SAMPLE = { minSeconds: 30, maxBytes: 10 * 1024 * 1024 } as const;
/** Trying a voice in the dashboard: a short line, 1 AI credit. */
export const VOICE_TRY_MAX = 150;

export const voiceNoteSchema = z.object({
  /** Which voice copy (VoiceClone id). */
  voiceId: z.string().max(40),
  script: z.string().max(VOICE_SCRIPT_MAX, `Voice notes can be at most ${VOICE_SCRIPT_MAX} characters`),
});
export type VoiceNote = z.infer<typeof voiceNoteSchema>;

/** What the customer reads aloud when recording their voice (about a minute). */
export const VOICE_READING = `Hi, this is me recording a sample of my own voice. I'm reading this out loud in a quiet room, at my normal speed, the way I'd talk to a customer on a call. I usually start my day with a quick look at my messages, then I spend most of my time talking to people about their work and how we might help each other. When something goes well, I like to send a short note to say thanks. When something is unclear, I'd rather pick up the phone than write a long email. Anyway, that's enough about me. Thanks for listening, and have a great day.`;

/** Seen in a script: speech can't carry links well, so they're flagged. */
export const scriptHasLink = (s: string) => /https?:\/\/|www\./i.test(s);

/** The script a new voice note starts with. */
export const VOICE_STARTER = "Hey {firstName}, it's me. I just wanted to say thanks for connecting. I'd love to hear what you're working on these days. Talk soon!";
