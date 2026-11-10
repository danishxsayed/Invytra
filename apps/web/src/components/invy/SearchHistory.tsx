"use client";

import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSearchAction, renameSearchAction } from "@/app/workspace/invy/actions";
import { cx } from "../ui";

type Row = { id: string; title: string; status: string; found: number; when: string };

/** Earlier searches: open (and continue), rename, delete. */
export function SearchHistory({ rows, base }: { rows: Row[]; base: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setEditing(null);
      router.refresh();
    });

  if (!rows.length) return <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-[14px] text-stone-500">Your searches will be listed here, so you can come back to them.</p>;
  return (
    <>
      {error && <p className="mb-2 text-[13px] text-rose-700">{error}</p>}
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
            {editing === r.id ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => renameSearchAction(r.id, name));
                }}
              >
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Search name" className="flex-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-[14px] focus:border-stone-500 focus:outline-none" />
                <button type="submit" disabled={pending} aria-label="Save name" className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900 text-white">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                </button>
                <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </form>
            ) : (
              <>
                <a href={`${base}/${r.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-stone-900">{r.title}</p>
                  <p className="text-[13px] text-stone-500">
                    {r.status === "QUEUED" || r.status === "RUNNING" ? "Invy is working…" : r.status === "FAILED" ? "Didn't finish" : `${r.found} business${r.found === 1 ? "" : "es"}`} · {r.when}
                  </p>
                </a>
                <div className={cx("flex items-center gap-1 transition", "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100")}>
                  <button type="button" aria-label={`Rename ${r.title}`} onClick={() => (setEditing(r.id), setName(r.title))} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${r.title}`}
                    disabled={pending}
                    onClick={() => confirm(`Delete “${r.title}”? Saved businesses stay saved.`) && run(() => deleteSearchAction(r.id))}
                    className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
