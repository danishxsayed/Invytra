"use client";

import { Loader2, Pause, Play, Rocket, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEmailCampaignAction, launchEmailCampaignAction, pauseEmailCampaignAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { cx } from "../../ui";

/** Launch (draft), pause / resume, delete. */
export function CampaignActions({ id, status, ready }: { id: string; status: string; ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      after ? after() : router.refresh();
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-hidden />}
        {status === "DRAFT" && (
          <button className={btn.primary} disabled={pending || !ready} onClick={() => run(() => launchEmailCampaignAction(id))} title={ready ? undefined : "Finish the steps below first"}>
            <Rocket className="h-4 w-4" aria-hidden /> Launch
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
        {!confirm ? (
          <button className={btn.ghost} onClick={() => setConfirm(true)} aria-label="Delete campaign">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button className={cx(btn.secondary, "border-rose-300 text-rose-700 hover:bg-rose-50")} disabled={pending} onClick={() => run(() => deleteEmailCampaignAction(id), () => router.push("/email/campaigns"))}>
            Delete campaign and its leads
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
    </div>
  );
}
