"use client";

import { tagLabel } from "@invytra/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { Portal } from "../../Portal";
import { cx } from "../../ui";

export interface InboxFilters {
  campaigns: string[];
  tags: string[];
  window: "" | "open" | "closed";
  reply: "" | "needs" | "replied";
  read: "" | "read" | "unread";
  since: "" | "today" | "7d" | "30d";
}
export interface FilterCounts {
  all: number;
  window: { open: number; closed: number };
  reply: { needs: number; replied: number };
  read: { read: number; unread: number };
  campaigns: { id: string; name: string; count: number }[];
  tags: { tag: string; count: number }[];
}

const SECTIONS = ["Campaign", "Tags", "Chat Status", "Reply Status", "Read/Unread", "Last Message Time"] as const;

/** Filters: one section at a time on the left, its options on the right. */
export function FilterDialog({ value, counts, onApply, onClose }: { value: InboxFilters; counts: FilterCounts; onApply: (f: InboxFilters) => void; onClose: () => void }) {
  const [f, setF] = useState(value);
  const [sec, setSec] = useState<(typeof SECTIONS)[number]>("Campaign");
  const active = (s: (typeof SECTIONS)[number]) => (s === "Campaign" ? f.campaigns.length > 0 : s === "Tags" ? f.tags.length > 0 : s === "Chat Status" ? !!f.window : s === "Reply Status" ? !!f.reply : s === "Read/Unread" ? !!f.read : !!f.since);
  const toggle = (k: "campaigns" | "tags", v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const reset = () => setF({ ...f, ...(sec === "Campaign" ? { campaigns: [] } : sec === "Tags" ? { tags: [] } : sec === "Chat Status" ? { window: "" } : sec === "Reply Status" ? { reply: "" } : sec === "Read/Unread" ? { read: "" } : { since: "" }) });

  const Radio = <K extends "window" | "reply" | "read" | "since">({ k, options }: { k: K; options: [InboxFilters[K], string, number | null][] }) => (
    <div className="space-y-2">
      {options.map(([v, l, n]) => (
        <button key={String(v)} type="button" onClick={() => setF({ ...f, [k]: v })} className={cx("flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left text-[16px]", f[k] === v ? "bg-emerald-50/70" : "hover:bg-stone-50")}>
          <span className={cx("grid h-6 w-6 place-items-center rounded-full ring-2", f[k] === v ? "ring-emerald-600" : "ring-stone-300")}>{f[k] === v && <span className="h-3 w-3 rounded-full bg-emerald-600" />}</span>
          <span className="flex-1 text-stone-900">{l}</span>
          {n !== null && <span className="text-[14px] text-stone-500">{n}</span>}
        </button>
      ))}
    </div>
  );
  const Check = ({ on, label, n, onClick }: { on: boolean; label: string; n: number; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left text-[16px] hover:bg-stone-50">
      <span className={cx("grid h-6 w-6 place-items-center rounded-md ring-2", on ? "bg-emerald-600 text-white ring-emerald-600" : "ring-stone-300")}>{on && <span className="text-[13px]">✓</span>}</span>
      <span className="flex-1 truncate text-stone-900">{label}</span>
      <span className="text-[14px] text-stone-500">{n}</span>
    </button>
  );
  const hint = { Campaign: "Chats with people who got a campaign", Tags: "Chats with contacts that have any of these tags", "Chat Status": "Open chats are inside WhatsApp's 24-hour reply window", "Reply Status": "Needs reply: their message is the last one", "Read/Unread": "Unread chats have messages nobody has opened", "Last Message Time": "When the last message was sent or received" }[sec];

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Filters">
        <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start justify-between px-7 pb-5 pt-7">
            <div>
              <h2 className="text-[24px] font-semibold text-stone-900">Filters</h2>
              <p className="text-[15px] text-stone-500">Narrow down your inbox</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full ring-1 ring-stone-200 hover:bg-stone-50">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 border-t border-stone-100 sm:grid-cols-[260px_1fr]">
            <nav className="border-r border-stone-100 bg-stone-50/70">
              {SECTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setSec(s)} className={cx("flex w-full items-center justify-between border-b border-stone-100 border-l-4 px-6 py-5 text-left text-[16px]", sec === s ? "border-l-emerald-500 bg-emerald-50/60 font-medium text-emerald-800" : "border-l-transparent text-stone-800 hover:bg-stone-100/70")}>
                  {s}
                  {active(s) && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </button>
              ))}
            </nav>
            <div className="min-h-[340px] overflow-y-auto p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[18px] font-semibold text-stone-900">{sec}</h3>
                <button type="button" onClick={reset} className="text-[15px] font-medium text-emerald-700 hover:underline">
                  Reset
                </button>
              </div>
              <p className="mb-4 mt-1 text-[14.5px] text-stone-500">{hint}</p>
              {sec === "Campaign" &&
                (counts.campaigns.length ? counts.campaigns.map((c) => <Check key={c.id} on={f.campaigns.includes(c.id)} label={c.name} n={c.count} onClick={() => toggle("campaigns", c.id)} />) : <p className="text-[14.5px] text-stone-500">No chats came from a campaign yet.</p>)}
              {sec === "Tags" && (counts.tags.length ? counts.tags.map((t) => <Check key={t.tag} on={f.tags.includes(t.tag)} label={tagLabel(t.tag)} n={t.count} onClick={() => toggle("tags", t.tag)} />) : <p className="text-[14.5px] text-stone-500">No tags on these chats yet.</p>)}
              {sec === "Chat Status" && <Radio k="window" options={[["", "All Chats", counts.all], ["open", "Open Chats", counts.window.open], ["closed", "Closed Chats", counts.window.closed]]} />}
              {sec === "Reply Status" && <Radio k="reply" options={[["", "All", counts.all], ["needs", "Needs reply", counts.reply.needs], ["replied", "Replied or done", counts.reply.replied]]} />}
              {sec === "Read/Unread" && <Radio k="read" options={[["", "All", counts.all], ["read", "Read", counts.read.read], ["unread", "Unread", counts.read.unread]]} />}
              {sec === "Last Message Time" && <Radio k="since" options={[["", "Any time", null], ["today", "Today", null], ["7d", "Last 7 days", null], ["30d", "Last 30 days", null]]} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-stone-100 px-7 py-5">
            <button type="button" onClick={() => setF({ campaigns: [], tags: [], window: "", reply: "", read: "", since: "" })} className="rounded-2xl py-3.5 text-[16px] font-semibold text-stone-900 ring-1 ring-stone-200 hover:bg-stone-50">
              Reset All
            </button>
            <button type="button" onClick={() => onApply(f)} className="rounded-2xl bg-emerald-500 py-3.5 text-[16px] font-semibold text-white hover:bg-emerald-600">
              Apply Filter
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
