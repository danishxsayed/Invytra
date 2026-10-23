"use client";

import { Loader2, Pause, Pencil, Play, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCampaignAction, setCampaignStatusAction } from "@/app/app/campaigns/actions";
import { btn } from "../AccountControls";
import { Modal } from "../Modal";

/** Launch / pause / resume / edit / delete on a campaign's page. */
export function CampaignControls({ id, name, status, problems }: { id: string; name: string; status: string; problems: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "DRAFT" && (
          <button className={btn.primary} disabled={pending || problems.length > 0} title={problems[0]} onClick={() => run(() => setCampaignStatusAction(id, "ACTIVE"))}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />} Launch
          </button>
        )}
        {status === "ACTIVE" && (
          <button className={btn.secondary} disabled={pending} onClick={() => run(() => setCampaignStatusAction(id, "PAUSED"))}>
            <Pause className="h-4 w-4" aria-hidden /> Pause
          </button>
        )}
        {status === "PAUSED" && (
          <button className={btn.primary} disabled={pending || problems.length > 0} title={problems[0]} onClick={() => run(() => setCampaignStatusAction(id, "ACTIVE"))}>
            <Play className="h-4 w-4" aria-hidden /> Resume
          </button>
        )}
        <Link href={`/app/campaigns/${id}/edit`} className={btn.secondary}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit
        </Link>
        <button className={btn.ghost} onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </button>
      </div>
      {error && <p className="text-[14px] text-rose-700">{error}</p>}
      {confirmDelete && (
        <Modal title={`Delete “${name}”?`} onClose={() => setConfirmDelete(false)} busy={pending}>
          <p className="text-[15px] text-stone-600">
            Steps still waiting in the queue are cancelled and the campaign's progress is removed. Invites and messages already sent stay on
            LinkedIn and in your activity log. Your lead list is kept.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[15px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              onClick={() => run(() => deleteCampaignAction(id), () => router.push("/app/campaigns"))}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete campaign
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
