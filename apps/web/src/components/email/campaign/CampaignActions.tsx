"use client";

import { playLaunchSound, primeSound } from "@/lib/sounds";
import { CalendarClock, Ban, Loader2, Pause, Play, Rocket, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelEmailCampaignAction, deleteEmailCampaignAction, launchEmailCampaignAction, pauseEmailCampaignAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { Field, TimeZoneSelect, inputCls } from "../../fields";
import { Modal } from "../../Modal";
import { cx } from "../../ui";

type Schedule = { local: string | null; timeZone: string | null; recipientTz: boolean };

/** "Send now" or "Schedule for later" (date, time, time zone; optionally each recipient's own). */
function LaunchModal({ id, zones, schedule, onClose }: { id: string; zones: string[]; schedule: Schedule; onClose: () => void }) {
  const router = useRouter();
  const tomorrow9 = () => {
    const d = new Date(Date.now() + 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T09:00`;
  };
  const [when, setWhen] = useState<"now" | "later">(schedule.local ? "later" : "now");
  const [local, setLocal] = useState(schedule.local ?? tomorrow9());
  const [timeZone, setTimeZone] = useState(schedule.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [recipientTz, setRecipientTz] = useState(schedule.recipientTz);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    primeSound();
    start(async () => {
      setError(null);
      const r = await launchEmailCampaignAction(id, when === "now" ? { when } : { when, local, timeZone, recipientTz });
      if (!r.ok) return setError(r.error);
      if (!schedule.local || when === "now") playLaunchSound();
      router.refresh();
      onClose();
    });
  };
  const choice = (v: "now" | "later", Icon: typeof Send, title: string, text: string) => (
    <label className={cx("flex cursor-pointer gap-3 rounded-xl border px-4 py-3", when === v ? "border-brand-500 bg-brand-50" : "border-stone-200 hover:border-stone-300")}>
      <input type="radio" name="when" className="mt-1 accent-lime-500" checked={when === v} onChange={() => setWhen(v)} />
      <span>
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-stone-900">
          <Icon className="h-4 w-4" aria-hidden /> {title}
        </span>
        <span className="block text-[14px] text-stone-500">{text}</span>
      </span>
    </label>
  );
  return (
    <Modal title={schedule.local ? "Change the schedule" : "Launch campaign"} description="Emails go out within each mailbox's sending hours and daily limit." onClose={onClose} busy={pending}>
      <div className="space-y-4">
        <div className="grid gap-2">
          {choice("now", Send, "Send now", "The first emails start going out within a minute.")}
          {choice("later", CalendarClock, "Schedule for later", "Pick a date and time. It sends even when you're signed out.")}
        </div>
        {when === "later" && (
          <div className="space-y-3 rounded-xl bg-stone-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date and time">
                <input type="datetime-local" className={inputCls} value={local} onChange={(e) => setLocal(e.target.value.slice(0, 16))} required />
              </Field>
              <Field label="Time zone">
                <TimeZoneSelect zones={zones} value={timeZone} onChange={setTimeZone} />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-[14px] text-stone-700">
              <input type="checkbox" className="mt-1 accent-lime-500" checked={recipientTz} onChange={(e) => setRecipientTz(e.target.checked)} />
              <span>
                Use each recipient's own time zone when their contact has one (a <code className="text-[13px]">{"{{timezone}}"}</code> column, e.g. America/Chicago); everyone else gets the time zone above.
              </span>
            </label>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className={btn.ghost} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className={btn.primary} onClick={go} disabled={pending || (when === "later" && !local)}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : when === "now" ? <Rocket className="h-4 w-4" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
            {when === "now" ? "Send now" : schedule.local ? "Save schedule" : "Schedule"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Launch / schedule (draft), change schedule, pause / resume, cancel, delete. */
export function CampaignActions({ id, status, ready, zones, schedule }: { id: string; status: string; ready: boolean; zones: string[]; schedule: Schedule }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "cancel" | null>(null);
  const [launch, setLaunch] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setConfirm(null);
      after ? after() : router.refresh();
    });
  const live = status === "SCHEDULED" || status === "ACTIVE" || status === "PAUSED";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-hidden />}
        {status === "DRAFT" && (
          <button className={btn.primary} disabled={pending || !ready} onClick={() => setLaunch(true)} title={ready ? undefined : "Finish the steps below first"}>
            <Rocket className="h-4 w-4" aria-hidden /> Launch
          </button>
        )}
        {status === "SCHEDULED" && (
          <button className={btn.secondary} disabled={pending} onClick={() => setLaunch(true)}>
            <CalendarClock className="h-4 w-4" aria-hidden /> Change schedule
          </button>
        )}
        {status === "ACTIVE" && (
          <button className={btn.secondary} disabled={pending} onClick={() => run(() => pauseEmailCampaignAction(id, true))}>
            <Pause className="h-4 w-4" aria-hidden /> Pause
          </button>
        )}
        {status === "PAUSED" && (
          <button className={btn.primary} disabled={pending} onClick={() => run(() => pauseEmailCampaignAction(id, false))}>
            <Play className="h-4 w-4" aria-hidden /> Resume
          </button>
        )}
        {live &&
          (confirm === "cancel" ? (
            <button className={cx(btn.secondary, "border-rose-300 text-rose-700 hover:bg-rose-50")} disabled={pending} onClick={() => run(() => cancelEmailCampaignAction(id))}>
              Cancel for good? Nothing more is sent
            </button>
          ) : (
            <button className={btn.ghost} onClick={() => setConfirm("cancel")}>
              <Ban className="h-4 w-4" aria-hidden /> Cancel campaign
            </button>
          ))}
        {confirm === "delete" ? (
          <button className={cx(btn.secondary, "border-rose-300 text-rose-700 hover:bg-rose-50")} disabled={pending} onClick={() => run(() => deleteEmailCampaignAction(id), () => router.push("/email/campaigns"))}>
            Delete campaign and its leads
          </button>
        ) : (
          <button className={btn.ghost} onClick={() => setConfirm("delete")} aria-label="Delete campaign">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
      {launch && <LaunchModal id={id} zones={zones} schedule={schedule} onClose={() => setLaunch(false)} />}
    </div>
  );
}
