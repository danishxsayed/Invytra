import { isWithinWorkingHours, type WorkingHours } from "./working-hours.js";

const STEP_MS = 15 * 60_000;
const MAX_LOOKAHEAD_MS = 8 * 24 * 60 * 60_000;

/**
 * The first moment at or after `from` that falls inside the account's working
 * hours, in its own time zone. Searches in 15-minute steps (works for zones with
 * :30 / :45 offsets) for up to 8 days.
 */
export function nextWorkingWindowStart(from: Date, timeZone: string, hours: WorkingHours): Date {
  if (isWithinWorkingHours(from, timeZone, hours)) return from;
  let t = Math.ceil(from.getTime() / STEP_MS) * STEP_MS;
  const limit = from.getTime() + MAX_LOOKAHEAD_MS;
  while (t <= limit) {
    if (isWithinWorkingHours(new Date(t), timeZone, hours)) return new Date(t);
    t += STEP_MS;
  }
  throw new Error(`No working hours found within 8 days for zone ${timeZone}`);
}
