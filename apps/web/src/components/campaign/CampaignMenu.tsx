"use client";

import { Copy, Eye, History, Loader2, MoreHorizontal, Pause, Pencil, Play, Trash2, UserPlus, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteCampaignAction, duplicateCampaignAction, setCampaignStatusAction } from "@/app/app/campaigns/actions";
import { btn } from "../AccountControls";
import { Modal } from "../Modal";

type Props = { id: string; name: string; status: string; listId: string | null };

const base = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition disabled:cursor-not-allowed disabled:opacity-50";
const item = `${base} text-stone-700 hover:bg-stone-50`;

/** The "⋯" quick actions on a row of the campaigns list. */
export function CampaignMenu({ id, name, status, listId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; value?: unknown }>, after?: (value: unknown) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) {
        setOpen(false);
        return setError(r.error ?? "Something went wrong.");
      }
      setOpen(false);
      setConfirmDelete(false);
      after?.(r.value);
      router.refresh();
    });

  const go = (Icon: LucideIcon, label: string, href: string) => (
    <Link role="menuitem" href={href} className={item} onClick={() => setOpen(false)}>
      <Icon className="h-4 w-4 text-stone-400" aria-hidden /> {label}
    </Link>
  );

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-5 w-5" aria-hidden />}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {go(Eye, "View details", `/app/campaigns/${id}`)}
          {go(Pencil, "Edit campaign", `/app/campaigns/${id}/edit`)}
          {go(Users, "People in campaign", `/app/campaigns/${id}#people`)}
          {listId ? (
            go(UserPlus, "Add people", `/app/leads/${listId}`)
          ) : (
            <button className={item} disabled title="Choose a lead list first">
              <UserPlus className="h-4 w-4 text-stone-400" aria-hidden /> Add people
            </button>
          )}
          <button role="menuitem" className={item} disabled={pending} onClick={() => run(() => duplicateCampaignAction(id), (newId) => router.push(`/app/campaigns/${newId}/edit`))}>
            <Copy className="h-4 w-4 text-stone-400" aria-hidden /> Duplicate campaign
          </button>
          {status === "ACTIVE" && (
            <button role="menuitem" className={item} disabled={pending} onClick={() => run(() => setCampaignStatusAction(id, "PAUSED"))}>
              <Pause className="h-4 w-4 text-stone-400" aria-hidden /> Pause campaign
            </button>
          )}
          {status === "PAUSED" && (
            <button role="menuitem" className={item} disabled={pending} onClick={() => run(() => setCampaignStatusAction(id, "ACTIVE"))}>
              <Play className="h-4 w-4 text-stone-400" aria-hidden /> Resume campaign
            </button>
          )}
          <div className="my-1 border-t border-stone-100" />
          {go(History, "Activity log", `/app/activity?campaign=${id}`)}
          <div className="my-1 border-t border-stone-100" />
          <button role="menuitem" className={`${base} text-rose-600 hover:bg-rose-50`} onClick={() => (setOpen(false), setConfirmDelete(true))}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete campaign
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="absolute right-0 top-10 z-20 w-64 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" onClick={() => setError(null)}>
          {error}
        </p>
      )}

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
              onClick={() => run(() => deleteCampaignAction(id))}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete campaign
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
