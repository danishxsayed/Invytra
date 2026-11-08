"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeDncAction } from "@/app/workspace/do-not-contact/actions";
import { btn } from "../AccountControls";

export interface DncRow {
  id: string;
  kind: string;
  label: string;
  note: string | null;
  added: string;
}

/** The list, with select-and-remove. */
export function DncTable({ rows }: { rows: DncRow[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, start] = useTransition();
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  return (
    <div>
      {picked.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50 px-5 py-2.5 text-[14px]">
          <span className="text-stone-700">{picked.size} selected</span>
          <button
            type="button"
            disabled={busy}
            className={btn.secondary}
            onClick={() =>
              start(async () => {
                await removeDncAction([...picked]);
                setPicked(new Set());
                router.refresh();
              })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Remove from list
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[14.5px]">
          <thead className="border-b border-stone-100 text-[12.5px] uppercase tracking-wide text-stone-400">
            <tr>
              <th className="w-10 px-5 py-3">
                <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4 accent-stone-900" />
              </th>
              <th className="px-2 py-3 font-medium">Entry</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Note</th>
              <th className="px-5 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id} className={picked.has(r.id) ? "bg-stone-50" : undefined}>
                <td className="px-5 py-3">
                  <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-stone-900" />
                </td>
                <td className="max-w-[340px] truncate px-2 py-3 font-medium text-stone-900" title={r.label}>
                  {r.label}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-600">{r.kind}</td>
                <td className="max-w-[240px] truncate px-5 py-3 text-stone-500" title={r.note ?? ""}>
                  {r.note ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-500">{r.added}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
