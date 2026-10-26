/**
 * LinkedIn shows message times as a date heading ("Today", "Monday", "Oct 18",
 * "Oct 18, 2025") and a time ("12:15 PM"), in the browser's time zone — which
 * Invytra sets to the account's own. This turns them into a real moment.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Wall-clock parts of `at` in a time zone. */
function partsIn(at: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "long", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), weekday: DAYS.indexOf(String(p.weekday).toLowerCase()), h: Number(p.hour), min: Number(p.minute) };
}

/** The UTC moment of a wall-clock time in a time zone. */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const guess = Date.UTC(y, m, d, h, min);
  const p = partsIn(new Date(guess), timeZone);
  const shown = Date.UTC(p.y, p.m, p.d, p.h, p.min);
  return new Date(guess - (shown - guess));
}

export function parseThreadTime(dateLabel: string, timeLabel: string, now: Date, timeZone: string): Date | null {
  const t = /(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(timeLabel);
  if (!t) return null;
  let h = Number(t[1]);
  const min = Number(t[2]);
  if (t[3]) h = (h % 12) + (t[3].toUpperCase() === "PM" ? 12 : 0);

  const today = partsIn(now, timeZone);
  const label = dateLabel.trim().toLowerCase();
  let y = today.y;
  let m = today.m;
  let d = today.d;
  if (!label || label === "today") {
    /* today */
  } else if (label === "yesterday") {
    const p = partsIn(new Date(now.getTime() - 86400_000), timeZone);
    ({ y, m, d } = p);
  } else if (DAYS.includes(label)) {
    const back = (today.weekday - DAYS.indexOf(label) + 7) % 7 || 7;
    const p = partsIn(new Date(now.getTime() - back * 86400_000), timeZone);
    ({ y, m, d } = p);
  } else {
    const md = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/.exec(label);
    if (!md || !MONTHS.includes(md[1]!)) return null;
    m = MONTHS.indexOf(md[1]!);
    d = Number(md[2]);
    y = md[3] ? Number(md[3]) : today.y;
    if (!md[3] && (m > today.m || (m === today.m && d > today.d))) y -= 1; // "Dec 30" seen in January
  }
  return zonedTime(y, m, d, h, min, timeZone);
}
