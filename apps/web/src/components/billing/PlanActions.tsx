"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelPlanAction, keepCurrentPlanAction } from "@/app/workspace/billing/actions";

/** Cancel the plan (it runs to the end of the paid period), or drop a change waiting for the renewal. */
export function PlanActions({ canCancel, pending, endsOn }: { canCancel: boolean; pending: boolean; endsOn: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? "Something went wrong." });
      setConfirm(false);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      {pending && (
        <button type="button" disabled={busy} onClick={() => run(keepCurrentPlanAction, "Kept your current plan.")} className="rounded-lg border border-stone-300 px-3.5 py-2 text-[14px] font-medium text-stone-800 hover:bg-stone-50">
          Keep my current plan
        </button>
      )}
      {canCancel &&
        (confirm ? (
          <span className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-900">
            Cancel? Your plan runs until {endsOn ?? "the end of this period"}, then sending stops.
            <button type="button" disabled={busy} onClick={() => run(cancelPlanAction, `Cancelled. Your plan runs until ${endsOn ?? "the end of this period"}.`)} className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Yes, cancel
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="font-medium text-rose-900 underline">
              Keep it
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="text-[14px] font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline">
            Cancel plan
          </button>
        ))}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[14px] text-emerald-700" : "text-[14px] text-rose-700"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
