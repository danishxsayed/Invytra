"use client";

import { ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeLeadsAction } from "@/app/app/leads/actions";
import { slugName, timeAgo } from "@/lib/format";
import type { LeadStage } from "@/lib/leads";
import { btn } from "./AccountControls";
import { Avatar, cx } from "./ui";

export interface LeadView {
  id: string;
  profileUrl: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  createdAt: string;
  status: { stage: LeadStage; at: string | null; detail?: string };
}

const STAGE: Record<LeadStage, { label: string; cls: string }> = {
  NONE: { label: "Not contacted", cls: "bg-stone-100 text-stone-600" },
  QUEUED: { label: "Queued", cls: "bg-sky-50 text-sky-700" },
  FAILED: { label: "Failed", cls: "bg-rose-50 text-rose-700" },
  VISITED: { label: "Visited", cls: "bg-teal-50 text-teal-700" },
  INVITED: { label: "Invited", cls: "bg-brand-100 text-brand-800" },
  CONNECTED: { label: "Connected", cls: "bg-emerald-50 text-emerald-700" },
  MESSAGED: { label: "Messaged", cls: "bg-emerald-100 text-emerald-800" },
};

export function LeadTable({ listId, rows }: { listId: string; rows: LeadView[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const now = new Date();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = () =>
    start(async () => {
      setError(null);
      const r = await removeLeadsAction(listId, [...selected]);
      if (!r.ok) return setError(r.error);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-brand-50 px-5 py-2.5">
          <span className="text-[15px] font-medium text-stone-800">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            {error && <span className="text-[14px] text-rose-700">{error}</span>}
            <button className={btn.ghost} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className={btn.secondary} onClick={remove} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove from list
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-stone-100 text-[13px] font-medium uppercase tracking-wide text-stone-400">
            <th className="w-12 py-2.5 pl-5">
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={all}
                onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))}
                className="h-4 w-4 rounded border-stone-300 accent-stone-900"
              />
            </th>
            <th className="py-2.5 pr-4 font-medium">Person</th>
            <th className="hidden py-2.5 pr-4 font-medium lg:table-cell">Location</th>
            <th className="hidden py-2.5 pr-4 font-medium sm:table-cell">Status</th>
            <th className="hidden py-2.5 pr-5 text-right font-medium md:table-cell">Added</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => {
            const name = [r.firstName, r.lastName].filter(Boolean).join(" ");
            const display = name || slugName(r.profileUrl) || "LinkedIn member";
            const sub = [r.title, r.company].filter(Boolean).join(" · ");
            const st = STAGE[r.status.stage];
            return (
              <tr key={r.id} className={cx("align-middle transition", selected.has(r.id) ? "bg-brand-50/60" : "hover:bg-stone-50/70")}>
                <td className="py-3 pl-5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${display}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                  />
                </td>
                <td className="max-w-0 py-3 pr-4 sm:max-w-none">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={display} />
                    <div className="min-w-0">
                      <a
                        href={r.profileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cx("inline-flex max-w-full items-center gap-1 truncate text-[15px] font-medium hover:underline", name ? "text-stone-900" : "capitalize text-stone-700")}
                      >
                        <span className="truncate">{display}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                      </a>
                      {sub && <p className="truncate text-[14px] text-stone-500">{sub}</p>}
                      <span className={cx("mt-1 flex w-fit whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium sm:hidden", st.cls)}>{st.label}</span>
                    </div>
                  </div>
                </td>
                <td className="hidden max-w-[200px] truncate py-3 pr-4 text-[14px] text-stone-500 lg:table-cell">{r.location ?? "—"}</td>
                <td className="hidden whitespace-nowrap py-3 pr-4 sm:table-cell">
                  <span title={r.status.detail} className={cx("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium", st.cls)}>
                    {st.label}
                  </span>
                  {r.status.at && <span className="ml-2 hidden text-[13px] text-stone-400 sm:inline">{timeAgo(new Date(r.status.at), now)}</span>}
                </td>
                <td className="hidden py-3 pr-5 text-right text-[14px] text-stone-400 md:table-cell">{timeAgo(new Date(r.createdAt), now)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
