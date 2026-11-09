import { z } from "zod";

/*
 * Video notes on LinkedIn: the customer records one video that starts with a greeting
 * ("Hi there,"). For each person, the greeting is spoken again in their copied voice with
 * the person's name ("Hi Priya,") and the lips are matched to it; the rest of the video is
 * their real recording. Sent as a video that plays inside the LinkedIn chat.
 */

/** The greeting said at the start, per person ("Hi {firstName},"). Short: it replaces a few seconds. */
export const VIDEO_INTRO_MAX = 40;
/** Recordings per workspace. */
export const VIDEOS_MAX = 5;
/** What a recording must be like. LinkedIn takes up to 20 MB per message, so it's kept to a minute. */
export const VIDEO_RECORDING = {
  minSeconds: 8,
  maxSeconds: 60,
  /** The upload before it's compressed. */
  maxBytes: 200 * 1024 * 1024,
  /** How long the greeting at the start lasts (it's the part that's personalized). */
  introMinMs: 1000,
  introMaxMs: 5000,
  introDefaultMs: 2000,
} as const;

/** The greeting a new video note starts with. */
export const VIDEO_INTRO_STARTER = "Hi {firstName},";
/** What the customer says first when recording (the part that's replaced per person). */
export const VIDEO_RECORDING_GREETING = "Hi there,";

export const videoNoteSchema = z.object({
  /** Which recording (VideoRecording id). */
  videoId: z.string().max(40),
  intro: z.string().max(VIDEO_INTRO_MAX, `The greeting can be at most ${VIDEO_INTRO_MAX} characters`),
});
export type VideoNote = z.infer<typeof videoNoteSchema>;

/** Recording file types accepted for upload (browsers record webm). */
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"] as const;
