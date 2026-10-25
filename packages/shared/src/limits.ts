import { z } from "zod";

/**
 * Per-account safety limits. Defaults are deliberately conservative —
 * LinkedIn restricts accounts that look robotic or high-volume.
 */
export const limitsSchema = z.object({
  connectionRequestsPerDay: z.number().int().min(0).max(40),
  connectionRequestsPerWeek: z.number().int().min(0).max(200),
  messagesPerDay: z.number().int().min(0).max(100),
  profileVisitsPerDay: z.number().int().min(0).max(150),
  /** Vary each day's totals a little below the limits, so no two days look the same. */
  randomizeDaily: z.boolean().default(true),
});
export type Limits = z.infer<typeof limitsSchema>;

export const DEFAULT_LIMITS: Limits = {
  connectionRequestsPerDay: 20,
  connectionRequestsPerWeek: 150,
  messagesPerDay: 50,
  profileVisitsPerDay: 80,
  randomizeDaily: true,
};

/** Hard ceilings a customer can never configure above. */
export const MAX_LIMITS = {
  connectionRequestsPerDay: 40,
  connectionRequestsPerWeek: 200,
  messagesPerDay: 100,
  profileVisitsPerDay: 150,
} as const;

/**
 * Search results pages read per account per day (10 people each on LinkedIn,
 * 25 on Sales Navigator). LinkedIn watches heavy searching; free accounts also
 * hit a monthly "commercial use" search limit.
 */
export const SEARCH_PAGES_PER_DAY = 30;

/** Connection-request note limit enforced by LinkedIn. */
export const CONNECTION_NOTE_MAX_CHARS = 300;

/** Random gap between two actions on the same account, in seconds. */
export const ACTION_DELAY_SECONDS = { min: 45, max: 240 } as const;
