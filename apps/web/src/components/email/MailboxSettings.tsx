"use client";

import { EMAIL_LIMITS } from "@invytra/shared";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMailboxSettingsAction, sendTestEmailAction } from "@/app/email/actions";
import type { MailboxRow } from "@/lib/mailboxes";
import { btn } from "../AccountControls";
import { Field, TimeZoneSelect, inputCls } from "../fields";
import { Modal } from "../Modal";
import { cx } from "../ui";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
export const hh = (h: number) => (h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`);

/** “Mon–Fri” / “Mon, Wed, Sat” / “Every day”. */
export function daysText(days: number[]): string {
  const d = [...days].sort();
  if (d.length === 7) return "every day";
  const run = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  return run && d.length > 2 ? `${DAYS[d[0]! - 1]}–${DAYS[d[d.length - 1]! - 1]}` : d.map((x) => DAYS[x - 1]).join(", ");
}

/** The mailbox's sending settings: name, daily limit, gap, days and hours, signature. */
export function MailboxSettingsModal({ m, zones, onClose }: { m: MailboxRow; zones: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState({
    fromName: m.fromName,
    dailyLimit: m.dailyLimit,
    gapMinutes: m.gapMinutes,
    timeZone: m.timeZone,
    days: m.sendDays,
    startHour: m.startHour,
    endHour: m.endHour,
    signature: m.signature,
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));
  const toggleDay = (d: number) => set("days", s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d]);
  const hoursOpen = Math.max(0, s.endHour - s.startHour);
  const fits = Math.floor((hoursOpen * 60) / Math.max(1, s.gapMinutes));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await saveMailboxSettingsAction(m.id, s);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal title={`Settings · ${m.email}`} description="How much this mailbox sends, and when." onClose={onClose} busy={pending} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sender name" className="sm:col-span-1">
            <input className={inputCls} value={s.fromName} onChange={(e) => set("fromName", e.target.value)} required maxLength={80} />
          </Field>
          <Field label="Emails a day" hint={`Up to ${EMAIL_LIMITS.maxDaily}. Start at 20–30.`}>
            <input type="number" className={inputCls} min={1} max={EMAIL_LIMITS.maxDaily} value={s.dailyLimit} onChange={(e) => set("dailyLimit", Number(e.target.value))} required />
          </Field>
          <Field label="Minutes between emails" hint="Spreads emails through the day.">
            <input type="number" className={inputCls} min={EMAIL_LIMITS.minGapMinutes} max={EMAIL_LIMITS.maxGapMinutes} value={s.gapMinutes} onChange={(e) => set("gapMinutes", Number(e.target.value))} required />
          </Field>
        </div>

        <div>
          <span className="text-[15px] font-medium text-stone-700">Sending days</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = s.days.includes(i + 1);
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => toggleDay(i + 1)}
                  className={cx("rounded-lg border px-3 py-1.5 text-[15px] font-medium transition", on ? "border-brand-500 bg-brand-400 text-stone-900" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From">
            <select className={inputCls} value={s.startHour} onChange={(e) => set("startHour", Number(e.target.value))}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Until">
            <select className={inputCls} value={s.endHour} onChange={(e) => set("endHour", Number(e.target.value))}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone">
            <TimeZoneSelect zones={zones} value={s.timeZone} onChange={(v) => set("timeZone", v)} />
          </Field>
        </div>
        {fits < s.dailyLimit && hoursOpen > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-800">
            With {s.gapMinutes} minutes between emails, {hoursOpen} sending hours fit about {fits} emails, fewer than the {s.dailyLimit} a day you set.
          </p>
        )}

        <Field label="Signature" hint="Plain text, added under every email.">
          <textarea className={cx(inputCls, "min-h-[96px]")} value={s.signature} onChange={(e) => set("signature", e.target.value)} maxLength={2000} placeholder={`${s.fromName}\nCompany · website`} />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.ghost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btn.primary} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save settings
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Sends a real test email now, to check the mailbox can send (and where it lands). */
export function TestEmailModal({ m, defaultTo, onClose }: { m: MailboxRow; defaultTo: string; onClose: () => void }) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await sendTestEmailAction(m.id, { to });
      if (!r.ok) return setError(r.error);
      setSentTo(to);
      router.refresh();
    });
  };
  return (
    <Modal title="Send a test email" description={`From ${m.fromName} <${m.email}>. It counts toward today's limit.`} onClose={onClose} busy={pending}>
      {sentTo ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Sent to {sentTo}. Check that it arrived in the inbox, not in spam or promotions.
          </p>
          <div className="flex justify-end">
            <button className={btn.primary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4">
          <Field label="Send to" hint="Tip: send to a Gmail and an Outlook address to see where it lands.">
            <input type="email" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required maxLength={254} />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn.ghost} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button className={btn.primary} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} {pending ? "Sending…" : "Send test"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
