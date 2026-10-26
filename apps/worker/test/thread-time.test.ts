import { describe, expect, it } from "vitest";
import { parseThreadTime } from "../src/linkedin/thread-time.js";

// Mon 26 Oct 2026, 14:00 IST
const now = new Date("2026-10-26T08:30:00Z");
const tz = "Asia/Kolkata";

describe("LinkedIn message times", () => {
  it("reads today, yesterday and weekday headings", () => {
    expect(parseThreadTime("TODAY", "12:15 PM", now, tz)).toEqual(new Date("2026-10-26T06:45:00Z"));
    expect(parseThreadTime("Yesterday", "9:05 AM", now, tz)).toEqual(new Date("2026-10-25T03:35:00Z"));
    expect(parseThreadTime("FRIDAY", "6:00 PM", now, tz)).toEqual(new Date("2026-10-23T12:30:00Z"));
  });
  it("reads month-day headings, with or without a year", () => {
    expect(parseThreadTime("OCT 18", "12:14 PM", now, tz)).toEqual(new Date("2026-10-18T06:44:00Z"));
    expect(parseThreadTime("Dec 30", "10:00 AM", now, tz)).toEqual(new Date("2025-12-30T04:30:00Z"));
    expect(parseThreadTime("Mar 3, 2025", "23:10", now, tz)).toEqual(new Date("2025-03-03T17:40:00Z"));
  });
  it("gives up on anything else", () => {
    expect(parseThreadTime("Oct 18", "", now, tz)).toBeNull();
    expect(parseThreadTime("last week", "1:00 PM", now, tz)).toBeNull();
  });
});
