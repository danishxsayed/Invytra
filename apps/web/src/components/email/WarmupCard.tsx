"use client";

import { EMAIL_WARMUP } from "@invytra/shared";
import { AlertTriangle, CheckCircle2, Flame, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveWarmupAction } from "@/app/email/actions";
import type { WarmupRow } from "@/lib/warmup";
import { btn } from "../AccountControls";
import { Field, Toggle, inputCls } from "../fields";
import { Card, cx } from "../ui";

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-xl bg-stone-50 px-4 py-3">
      <p className="text-[13px] font-medium text-stone-500">{label}</p>
      <p className={cx("mt-0.5 text-[22px] font-semibold tracking-tight", tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-stone-900")}>{value}</p>
    </div>
  );
}

function StageNote({ r }: { r: WarmupRow }) {
  const note = (Icon: typeof Flame, cls: string, text: string) => (
    <p className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-[14px]", cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {text}
    </p>
  );
  switch (r.stage) {
    case "OFF":
      return note(Flame, "bg-stone-50 text-stone-600", `Off. Turn it on to start: ${EMAIL_WARMUP.startDaily} emails on day 1, then ${EMAIL_WARMUP.stepDaily} more each day up to your maximum.`);
    case "NOT_ACTIVE":
      return note(AlertTriangle, "bg-amber-50 text-amber-800", "This mailbox is paused or needs attention, so warm-up is waiting. Fix it on the Mailboxes tab.");
    case "NO_PARTNER":
      return note(Users, "bg-amber-50 text-amber-800", "Waiting for a partner: warm-up needs at least one more mailbox in the pool. Connect a second mailbox (ideally on another domain, or a Gmail address) and turn warm-up on for it too.");
    case "READY":
      return note(CheckCircle2, "bg-emerald-50 text-emerald-800", `Ready for campaigns: ${r.day} days of warm-up and ${r.rate}% in the inbox. Keep warm-up on while you send.`);
    case "WARMING":
      return note(
        Flame,
        "bg-orange-50 text-orange-800",
        `Warming up: day ${r.day}. Cold email is best after ${EMAIL_WARMUP.readyAfterDays} days with ${EMAIL_WARMUP.healthyInboxRate}%+ in the inbox. Sends only during this mailbox's sending hours.`,
      );
  }
}

export function WarmupCard({ r }: { r: WarmupRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [maxDaily, setMaxDaily] = useState(r.warmupMaxDaily);
  const [replyRate, setReplyRate] = useState(r.warmupReplyRate);
  const dirty = maxDaily !== r.warmupMaxDaily || replyRate !== r.warmupReplyRate;

  const save = (enabled: boolean) =>
    start(async () => {
      setError(null);
      const res = await saveWarmupAction(r.id, { enabled, maxDaily, replyRate });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  const checked = r.last7.inbox + r.last7.spam + r.last7.missing;
  const rateTone = r.rate === null ? undefined : r.rate >= EMAIL_WARMUP.healthyInboxRate ? "good" : r.rate >= 70 ? "warn" : "bad";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-stone-900">{r.email}</p>
          <p className="text-[14px] text-stone-500">{r.fromName}</p>
        </div>
        <div className="flex items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-hidden />}
          <Toggle checked={r.warmupEnabled} onChange={(v) => save(v)} label={r.warmupEnabled ? "Warm-up on" : "Warm-up off"} />
        </div>
      </div>

      <div className="mt-3">
        <StageNote r={r} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sent today" value={r.warmupEnabled ? `${r.sentToday} / ${r.target}` : "—"} />
        <Stat label="Inbox rate (7 days)" value={r.rate === null ? "—" : `${r.rate}%`} tone={rateTone} />
        <Stat label="Landed in spam" value={checked ? `${r.last7.spam}` : "—"} tone={r.last7.spam ? "warn" : undefined} />
        <Stat label="Received (replies)" value={`${r.received} (${r.replies})`} />
      </div>
      {checked > 0 && (
        <p className="mt-2 text-[13px] text-stone-500">
          Last 7 days: {checked} checked · {r.last7.inbox} inbox · {r.last7.spam} spam (moved out) · {r.last7.missing} not found
        </p>
      )}
      {r.lastFail && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Last failed send: {r.lastFail.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-stone-100 pt-4">
        <Field label="Warm-up emails a day, at most" hint={`Up to ${EMAIL_WARMUP.maxMaxDaily}.`} className="w-56">
          <input type="number" className={inputCls} min={5} max={EMAIL_WARMUP.maxMaxDaily} value={maxDaily} onChange={(e) => setMaxDaily(Number(e.target.value))} />
        </Field>
        <Field label="Reply to (%)" hint="Of warm-up emails it receives." className="w-48">
          <input type="number" className={inputCls} min={0} max={80} value={replyRate} onChange={(e) => setReplyRate(Number(e.target.value))} />
        </Field>
        <button className={cx(btn.secondary, "mb-6")} disabled={!dirty || pending} onClick={() => save(r.warmupEnabled)}>
          Save
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[14px] text-rose-700">
          {error}
        </p>
      )}
    </Card>
  );
}
