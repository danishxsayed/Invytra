"use client";

import { Loader2, Pause, Play, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeWaCampaignAction } from "@/app/whatsapp/campaigns/actions";
import { btn } from "../../btn";

/** Pause, resume or cancel a campaign (cancel asks first). */
export function CampaignControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = (to: "pause" | "resume" | "cancel") =>
    start(async () => {
      const r = await changeWaCampaignAction(id, to);
      setAsk(false);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });
  if (status === "DONE" || status === "CANCELLED") return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "PAUSED" ? (
          <button type="button" className={btn.primary} disabled={pending} onClick={() => go("resume")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Resume
          </button>
        ) : (
          <button type="button" className={btn.secondary} disabled={pending} onClick={() => go("pause")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />} Pause
          </button>
        )}
        {!ask && (
          <button type="button" className={btn.ghost} onClick={() => setAsk(true)}>
            <XCircle className="h-4 w-4" aria-hidden /> Cancel
          </button>
        )}
      </div>
      {ask && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13.5px] text-rose-900 ring-1 ring-rose-200">
          Cancel it? Messages not sent yet are dropped; sent ones stay.{" "}
          <button type="button" className="font-semibold underline" onClick={() => go("cancel")} disabled={pending}>
            Cancel campaign
          </button>{" "}
          ·{" "}
          <button type="button" className="underline" onClick={() => setAsk(false)}>
            Keep it
          </button>
        </p>
      )}
      {error && <p className="text-[13.5px] text-rose-700">{error}</p>}
    </div>
  );
}
