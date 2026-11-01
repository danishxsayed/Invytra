"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteContactsAction, deleteListAction, setSubscribedAction } from "@/app/email/contacts/actions";
import { btn } from "../../AccountControls";
import { cx } from "../../ui";
import { downloadSampleCsv } from "./ImportContacts";

export function SampleCsvButton() {
  return (
    <button type="button" className={btn.ghost} onClick={downloadSampleCsv}>
      Download sample CSV
    </button>
  );
}

/** Unsubscribe / subscribe again / delete, for one contact. */
export function ContactActions({ id, subscribed }: { id: string; subscribed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean }>) => start(async () => void ((await fn()).ok && router.refresh()));
  return (
    <span className="flex items-center justify-end gap-1">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" aria-hidden />}
      <button className="rounded px-1.5 py-0.5 text-[12.5px] text-stone-500 hover:bg-stone-100 hover:text-stone-800" disabled={pending} onClick={() => run(() => setSubscribedAction(id, !subscribed))}>
        {subscribed ? "Unsubscribe" : "Subscribe again"}
      </button>
      {confirm ? (
        <button className="rounded px-1.5 py-0.5 text-[12.5px] font-medium text-rose-700 hover:bg-rose-50" disabled={pending} onClick={() => run(() => deleteContactsAction([id]))}>
          Delete?
        </button>
      ) : (
        <button className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Delete contact" onClick={() => setConfirm(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function DeleteListButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <button
      className={cx(btn.secondary, "border-rose-300 py-1 text-[13px] text-rose-700 hover:bg-rose-50")}
      disabled={pending}
      onClick={() => start(async () => void ((await deleteListAction(id)).ok && router.push("/email/contacts")))}
    >
      Delete “{name}” (contacts stay)
    </button>
  ) : (
    <button className={cx(btn.ghost, "py-1 text-[13px]")} onClick={() => setConfirm(true)}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete list
    </button>
  );
}
