import { z } from "zod";

/** Weekdays use ISO numbering: 1 = Monday … 7 = Sunday. */
export const workingHoursSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  })
  .refine((w) => w.endHour > w.startHour, { message: "endHour must be after startHour" });
export type WorkingHours = z.infer<typeof workingHoursSchema>;

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
};

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Local weekday (1-7) and hour (0-23) for an instant in an IANA time zone. */
export function localTime(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = WEEKDAY[parts.find((p) => p.type === "weekday")?.value ?? ""];
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (weekday === undefined || Number.isNaN(hour)) {
    throw new Error(`Could not resolve local time for zone ${timeZone}`);
  }
  return { weekday, hour };
}

export function isWithinWorkingHours(now: Date, timeZone: string, hours: WorkingHours): boolean {
  const { weekday, hour } = localTime(now, timeZone);
  return hours.days.includes(weekday) && hour >= hours.startHour && hour < hours.endHour;
}
