"use client";

import { ALL_DAYS, WEEKDAYS, daysText, type CampaignSettings } from "@invytra/shared";
import { startText } from "@/lib/campaign-text";
import { inputCls } from "../fields";
import { cx } from "../ui";

const DAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** yyyy-mm-dd in the browser's time zone, for <input type="date">. */
function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = () => localDate(new Date().toISOString());

/**
 * Which days the campaign sends on, and when it starts. Hours, limits and pacing
 * stay with each sender account.
 */
export function SendSchedule({
  settings,
  onSettings,
  canChangeStart,
}: {
  settings: CampaignSettings;
  onSettings: (s: CampaignSettings) => void;
  canChangeStart: boolean;
}) {
  const days = settings.days;
  const toggle = (d: number) => onSettings({ ...settings, days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b) });
  const setDays = (d: readonly number[]) => onSettings({ ...settings, days: [...d] });
  const scheduled = !!settings.startAt;

  return (
    <div className="mt-5 grid gap-5 border-t border-stone-100 pt-5 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="text-[15px] font-medium text-stone-700">
          Send on <span className="font-normal text-stone-500">· {days.length ? daysText(days) : "no days picked"}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Sending days">
          {DAY_LABEL.map((label, i) => {
            const on = days.includes(i + 1);
            return (
              <button
                type="button"
                key={label}
                aria-pressed={on}
                onClick={() => toggle(i + 1)}
                className={cx(
                  "min-w-[52px] rounded-lg border px-3 py-1.5 text-[15px] font-medium transition",
                  on ? "border-brand-500 bg-brand-400 text-stone-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-3 text-[14px]">
          <button type="button" className="font-medium text-brand-800 hover:underline" onClick={() => setDays(WEEKDAYS)}>
            Weekdays
          </button>
          <button type="button" className="font-medium text-brand-800 hover:underline" onClick={() => setDays(ALL_DAYS)}>
            Every day
          </button>
        </div>
        <p className="mt-2 text-[14px] text-stone-500">
          Times follow each account's working hours and time zone. {days.some((d) => d >= 6) && "Fewer people check LinkedIn at weekends, so replies may come slower."}
        </p>
      </div>

      {canChangeStart && (
        <div>
          <p className="text-[15px] font-medium text-stone-700">Start</p>
          <div className="mt-2 space-y-2 text-[15px]">
            <label className="flex items-center gap-2.5">
              <input type="radio" name="start" checked={!scheduled} onChange={() => onSettings({ ...settings, startAt: null })} className="h-4 w-4 accent-stone-900" />
              As soon as I launch
            </label>
            <label className="flex flex-wrap items-center gap-2.5">
              <input
                type="radio"
                name="start"
                checked={scheduled}
                onChange={() => {
                  const next = new Date();
                  next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7)); // next Monday
                  next.setHours(0, 0, 0, 0);
                  onSettings({ ...settings, startAt: next.toISOString() });
                }}
                className="h-4 w-4 accent-stone-900"
              />
              On a date
              {scheduled && (
                <input
                  type="date"
                  aria-label="Start date"
                  className={cx(inputCls, "w-auto py-1.5")}
                  min={today()}
                  value={localDate(settings.startAt)}
                  onChange={(e) => e.target.value && onSettings({ ...settings, startAt: new Date(`${e.target.value}T00:00`).toISOString() })}
                />
              )}
            </label>
          </div>
          {scheduled && settings.startAt && (
            <p className="mt-2 text-[14px] text-stone-500">Nothing is sent before {startText(settings.startAt)}. You can launch it now and leave it.</p>
          )}
        </div>
      )}
    </div>
  );
}
