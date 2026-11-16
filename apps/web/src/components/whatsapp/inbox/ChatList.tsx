"use client";

import { tagColor } from "@invytra/shared";
import { ArrowDownUp, CheckCircle2, Filter, Search, Star, UserRound } from "lucide-react";
import { useState } from "react";
import type { ChatRow } from "@/lib/whatsapp-inbox";
import { cx } from "../../ui";
import { FilterDialog, type FilterCounts, type InboxFilters } from "./FilterDialog";

export const initials = (n: string) =>
  n
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
const when = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export interface ListState extends InboxFilters {
  tab: "all" | "unread" | "priority";
  assigned: string;
  q: string;
  sort: "new" | "old";
}

/** The chat list: search, filters, sort, tabs (All / Unread / Priority), assigned to, chats. */
export function ChatList({ chats, counts, state, members, me, openId, onState, onOpen }: { chats: ChatRow[]; counts: FilterCounts & { unread: number; priority: number }; state: ListState; members: { id: string; name: string }[]; me: string; openId: string | null; onState: (s: Partial<ListState>) => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState(state.q);
  const [filters, setFilters] = useState(false);
  const nFilters = state.campaigns.length + state.tags.length + [state.window, state.reply, state.read, state.since].filter(Boolean).length;
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-4 pb-3">
        <h1 className="text-[24px] font-semibold text-stone-900">Inbox</h1>
        <div className="flex gap-2">
          <form className="relative flex-1" onSubmit={(e) => (e.preventDefault(), onState({ q: q.trim() }))}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== state.q && onState({ q: q.trim() })} placeholder="Search chats" className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-[15px] focus:border-emerald-400 focus:outline-none" aria-label="Search chats" />
          </form>
          <button type="button" onClick={() => setFilters(true)} className={cx("relative grid h-11 w-11 place-items-center rounded-xl border bg-white", nFilters ? "border-emerald-400 text-emerald-700" : "border-stone-200 text-stone-500 hover:text-stone-800")} aria-label="Filters">
            <Filter className="h-4 w-4" aria-hidden />
            {nFilters > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">{nFilters}</span>}
          </button>
          <button type="button" onClick={() => onState({ sort: state.sort === "new" ? "old" : "new" })} className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:text-stone-800" aria-label={state.sort === "new" ? "Newest first (click for oldest first)" : "Oldest first (click for newest first)"} title={state.sort === "new" ? "Newest first" : "Oldest first"}>
            <ArrowDownUp className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
          {(
            [
              ["all", "All", counts.all],
              ["unread", "Unread", counts.unread],
              ["priority", "Priority", counts.priority],
            ] as const
          ).map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={state.tab === k} onClick={() => onState({ tab: k })} className={cx("rounded-lg py-2 text-[14.5px]", state.tab === k ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
              {l} <span className="text-stone-400">{n}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[14px] text-stone-500">
          <UserRound className="h-4 w-4" aria-hidden /> Assigned to
          <select value={state.assigned} onChange={(e) => onState({ assigned: e.target.value })} className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[14.5px] text-stone-800">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Unassigned</option>
            {members
              .filter((m) => m.id !== me)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {!chats.length && <li className="px-4 py-10 text-center text-[14.5px] text-stone-500">{nFilters || state.q || state.tab !== "all" || state.assigned ? "No chats match." : "No chats yet. When someone replies to a campaign or writes to your number, it shows up here."}</li>}
        {chats.map((c) => {
          const hue = tagColor(c.name);
          const who = c.assignedTo ? byId.get(c.assignedTo) : null;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className={cx("flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition", openId === c.id ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-stone-50")}>
                <span className="relative shrink-0">
                  <span className="grid h-11 w-11 place-items-center rounded-full text-[14px] font-bold" style={{ background: `${hue}1f`, color: hue }}>
                    {initials(c.name)}
                  </span>
                  {c.open && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" title="24-hour window open" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cx("min-w-0 flex-1 truncate text-[15.5px]", c.unread ? "font-semibold text-stone-900" : "font-medium text-stone-800")}>{c.name}</span>
                    {c.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-emerald-500 text-emerald-500" aria-label="Priority" />}
                    <span className={cx("shrink-0 text-[12.5px]", c.unread ? "font-medium text-emerald-700" : "text-stone-400")}>{when(c.at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={cx("min-w-0 flex-1 truncate text-[14px]", c.unread ? "text-stone-800" : "text-stone-500")}>{c.preview || " "}</span>
                    {c.done && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />}
                    {who && (
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200" title={`Assigned to ${who}`}>
                        {initials(who)}
                      </span>
                    )}
                    {c.unread > 0 && <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-emerald-600 px-1.5 text-[12px] font-bold text-white">{c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {filters && (
        <FilterDialog
          value={state}
          counts={counts}
          onClose={() => setFilters(false)}
          onApply={(f) => {
            setFilters(false);
            onState(f);
          }}
        />
      )}
    </div>
  );
}
