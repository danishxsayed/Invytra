"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/app/accounts/actions";
import { btn } from "./AccountControls";
import { Field, Toggle, TimeZoneSelect, inputCls } from "./fields";
import { Card, cx } from "./ui";

interface Limits {
  connectionRequestsPerDay: number;
  connectionRequestsPerWeek: number;
  messagesPerDay: number;
  profileVisitsPerDay: number;
  randomizeDaily: boolean;
}

interface Props {
  id: string;
  zones: string[];
  proxyRequired: boolean;
  initial: {
    label: string;
    timezone: string;
    limits: Limits;
    workingHours: { days: number[]; startHour: number; endHour: number };
    warmup: boolean;
    proxy: string | null;
  };
  defaults: Limits;
  max: Omit<Limits, "randomizeDaily">;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const LIMIT_ROWS: { key: keyof Omit<Limits, "randomizeDaily">; label: string; hint: string; warnAbove: number }[] = [
  { key: "connectionRequestsPerDay", label: "Connection requests per day", hint: "LinkedIn watches invites most closely.", warnAbove: 25 },
  { key: "connectionRequestsPerWeek", label: "Connection requests per week", hint: "LinkedIn caps most accounts at about 100–200 a week.", warnAbove: 150 },
  { key: "messagesPerDay", label: "Messages per day", hint: "To people you're already connected with.", warnAbove: 60 },
  { key: "profileVisitsPerDay", label: "Profile visits per day", hint: "Visits before an invite look natural.", warnAbove: 100 },
];

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8 md:p-6">
      <div>
        <h2 className="text-[17px] font-semibold text-stone-900">{title}</h2>
        <p className="mt-1 text-[15px] text-stone-500">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

export function SettingsForm({ id, zones, proxyRequired, initial, defaults, max }: Props) {
  const router = useRouter();
  const [label, setLabel] = useState(initial.label);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [limits, setLimits] = useState(initial.limits);
  const [hours, setHours] = useState(initial.workingHours);
  const [warmup, setWarmup] = useState(initial.warmup);
  const [proxyUrl, setProxyUrl] = useState("");
  const [removeProxy, setRemoveProxy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const setLimit = (k: keyof Omit<Limits, "randomizeDaily">, v: number) => {
    setSaved(false);
    setLimits((l) => ({ ...l, [k]: Math.max(0, Math.min(max[k], Math.round(v) || 0)) }));
  };
  const toggleDay = (d: number) => {
    setSaved(false);
    setHours((h) => ({ ...h, days: h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d].sort() }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hours.days.length === 0) return setError("Pick at least one working day.");
    if (hours.endHour <= hours.startHour) return setError("Working hours must end after they start.");
    start(async () => {
      setError(null);
      const r = await saveSettingsAction(id, { label, timezone, limits, workingHours: hours, warmup, proxyUrl: proxyUrl || undefined, removeProxy });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      setProxyUrl("");
      setRemoveProxy(false);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-4">
      <Section title="Account" description="The name is only shown to you.">
        <Field label="Name">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} required />
        </Field>
      </Section>

      <Section title="Daily limits" description="Invytra never goes above these. Lower is safer, especially for newer accounts.">
        {LIMIT_ROWS.map((row) => {
          const v = limits[row.key];
          return (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={row.key} className="text-[15px] font-medium text-stone-800">
                  {row.label}
                </label>
                <input
                  type="number"
                  min={0}
                  max={max[row.key]}
                  value={v}
                  onChange={(e) => setLimit(row.key, Number(e.target.value))}
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1 text-right text-[15px] tabular focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200"
                  aria-label={`${row.label} (number)`}
                />
              </div>
              <input
                id={row.key}
                type="range"
                min={0}
                max={max[row.key]}
                value={v}
                onChange={(e) => setLimit(row.key, Number(e.target.value))}
                style={{ "--p": `${(v / max[row.key]) * 100}%` } as React.CSSProperties}
                className="range mt-3 w-full"
              />
              <p className={cx("text-[14px]", v > row.warnAbove ? "text-amber-700" : "text-stone-500")}>
                {v > row.warnAbove ? `Above ${row.warnAbove} raises the risk of a LinkedIn restriction. ` : `${row.hint} `}
                Recommended: {defaults[row.key]}.
              </p>
            </div>
          );
        })}
        <Toggle
          checked={limits.randomizeDaily}
          onChange={(v) => setLimits((l) => ({ ...l, randomizeDaily: v }))}
          label="Vary each day's totals"
          hint="Each day stops somewhere between 80% and 100% of the limits, so no two days look the same."
        />
        <Toggle
          checked={warmup}
          onChange={setWarmup}
          label="Warm up over 14 days"
          hint="Starts at about a third of the limits and grows daily. Turning it on restarts the ramp."
        />
      </Section>

      <Section title="Working hours" description="Actions only run in these hours, in the account's own time zone.">
        <div>
          <span className="text-[15px] font-medium text-stone-700">Days</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = hours.days.includes(i + 1);
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => toggleDay(i + 1)}
                  className={cx(
                    "rounded-lg border px-3 py-1.5 text-[15px] font-medium transition",
                    on ? "border-brand-500 bg-brand-400 text-stone-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select className={inputCls} value={hours.startHour} onChange={(e) => setHours((h) => ({ ...h, startHour: Number(e.target.value) }))}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Until">
            <select className={inputCls} value={hours.endHour} onChange={(e) => setHours((h) => ({ ...h, endHour: Number(e.target.value) }))}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h}>
                  {h === 24 ? "24:00 (midnight)" : hh(h)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Time zone">
          <TimeZoneSelect zones={zones} value={timezone} onChange={setTimezone} />
        </Field>
      </Section>

      <Section title="Proxy" description="Each account needs its own proxy, ideally in the account's country. Stored encrypted.">
        <p className="text-[15px] text-stone-700">
          Current: <span className="font-medium">{initial.proxy ?? "none — this computer's own connection"}</span>
        </p>
        <Field label={initial.proxy ? "Replace with" : "Proxy"} hint="Format: http://user:password@host:port. Leave empty to keep the current one.">
          <input
            className={inputCls}
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder="http://user:password@host:port"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {initial.proxy && !proxyRequired && (
          <Toggle checked={removeProxy} onChange={setRemoveProxy} label="Remove the proxy" hint="Development only." />
        )}
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 shadow-card backdrop-blur">
        {error && (
          <p role="alert" className="mr-auto text-[15px] text-rose-700">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mr-auto inline-flex items-center gap-1.5 text-[15px] font-medium text-emerald-700" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </p>
        )}
        <button className={btn.primary} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save changes
        </button>
      </div>
    </form>
  );
}
