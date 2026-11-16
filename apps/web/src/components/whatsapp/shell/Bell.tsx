"use client";

import { AtSign, Bell as BellIcon, Check, FileCheck2, FileX2, Megaphone, Settings, UserPlus, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationRow, NotificationTab } from "@/lib/notifications";
import { cx } from "../../ui";
import { initials } from "../inbox/ChatList";
import { usePulse } from "./pulse";

const TABS: [NotificationTab, string][] = [
  ["all", "All"],
  ["MENTION", "Mentions"],
  ["ASSIGNED", "Assigned"],
  ["CAMPAIGN", "Campaigns"],
  ["TEMPLATE", "Templates"],
];
const KIND: Record<string, string> = { MENTION: "Mention", ASSIGNED: "Assignment", CAMPAIGN: "Campaign", TEMPLATE: "Template" };
type Counts = Record<NotificationTab, number>;

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function group(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return "Yesterday";
  return "Earlier";
}

function Face({ n }: { n: NotificationRow }) {
  if (n.kind === "CAMPAIGN")
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
        <Megaphone className="h-5 w-5" aria-hidden />
      </span>
    );
  if (n.kind === "TEMPLATE")
    return (
      <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", n.tone === "good" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>
        {n.tone === "good" ? <FileCheck2 className="h-5 w-5" aria-hidden /> : <FileX2 className="h-5 w-5" aria-hidden />}
      </span>
    );
  const Icon = n.kind === "MENTION" ? AtSign : UserPlus;
  return (
    <span className="relative shrink-0">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-sky-50 text-[14px] font-bold text-sky-800">{initials(n.actor ?? "?")}</span>
      <span className={cx("absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full ring-2 ring-white", n.kind === "MENTION" ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}>
        <Icon className="h-3 w-3" aria-hidden />
      </span>
    </span>
  );
}

/** The bell: mentions, chats assigned to you, campaign reports, template reviews; sound on/off. */
export function Bell() {
  const pulse = usePulse();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NotificationTab>("all");
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ all: 0, MENTION: 0, ASSIGNED: 0, CAMPAIGN: 0, TEMPLATE: 0 });
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async (t: NotificationTab) => {
    try {
      const r = await fetch(`/whatsapp/notifications?tab=${t}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { items: NotificationRow[]; counts: Counts };
      setItems(d.items);
      setCounts(d.counts);
    } catch {
      setItems((x) => x ?? []);
    }
  }, []);
  // Opening the bell (and new ones arriving while it's open) loads the list.
  useEffect(() => {
    if (open) void load(tab);
  }, [open, tab, pulse.bell, load]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const mark = async (ids?: string[]) => {
    setItems((xs) => xs?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) ?? null);
    try {
      await fetch("/whatsapp/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) });
    } finally {
      pulse.refresh();
      void load(tab);
    }
  };
  const go = (n: NotificationRow) => {
    if (!n.read) void mark([n.id]);
    setOpen(false);
    if (n.href) window.location.assign(n.href);
  };

  let lastGroup = "";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cx("relative grid h-10 w-10 place-items-center rounded-xl text-stone-600 ring-1 transition hover:bg-stone-50", open ? "ring-2 ring-emerald-500" : "ring-stone-200")}
        aria-label={pulse.bell ? `Notifications, ${pulse.bell} new` : "Notifications"}
        aria-expanded={open}
      >
        <BellIcon className="h-5 w-5" aria-hidden />
        {pulse.bell > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">{pulse.bell > 99 ? "99+" : pulse.bell}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 flex max-h-[min(640px,calc(100dvh-90px))] w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-stone-200" role="dialog" aria-label="Notifications">
          <div className="flex items-center gap-3 px-5 pb-3 pt-5">
            <h2 className="flex-1 text-[20px] font-semibold text-stone-900">{settings ? "Notification settings" : "Notifications"}</h2>
            {!settings && counts.all > 0 && (
              <button type="button" onClick={() => void mark()} className="text-[14.5px] font-medium text-emerald-700 hover:underline">
                Mark all read
              </button>
            )}
            <button type="button" onClick={() => setSettings(!settings)} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label={settings ? "Back to notifications" : "Settings"}>
              {settings ? <X className="h-5 w-5" aria-hidden /> : <Settings className="h-5 w-5" aria-hidden />}
            </button>
          </div>

          {settings ? (
            <div className="space-y-3 px-5 pb-5">
              <button type="button" onClick={() => pulse.setSound(!pulse.sound)} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 ring-stone-200 hover:bg-stone-50" role="switch" aria-checked={pulse.sound}>
                {pulse.sound ? <Volume2 className="h-5 w-5 text-emerald-600" aria-hidden /> : <VolumeX className="h-5 w-5 text-stone-400" aria-hidden />}
                <span className="flex-1">
                  <span className="block text-[15px] font-medium text-stone-900">Sound for new messages</span>
                  <span className="block text-[13.5px] text-stone-500">A soft pop when someone writes to your number, on any WhatsApp page. Only on this browser.</span>
                </span>
                <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", pulse.sound ? "bg-emerald-500" : "bg-stone-300")}>
                  <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", pulse.sound ? "left-[22px]" : "left-0.5")} />
                </span>
              </button>
              <p className="px-1 text-[13.5px] text-stone-500">The number of chats with unread messages also shows on the browser tab, so you can see it from another tab.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto border-b border-stone-100 px-5 pb-3 [scrollbar-width:none]" role="tablist">
                {TABS.map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14.5px] font-medium", tab === k ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}>
                    {l}
                    {counts[k] > 0 && <span className={cx("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[12px] font-semibold", tab === k ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-700")}>{counts[k]}</span>}
                  </button>
                ))}
              </div>
              <div className="min-h-[160px] flex-1 overflow-y-auto pb-2">
                {items === null && <p className="px-5 py-10 text-center text-[14.5px] text-stone-400">Loading…</p>}
                {items?.length === 0 && (
                  <div className="px-8 py-10 text-center">
                    <BellIcon className="mx-auto h-8 w-8 text-stone-300" aria-hidden />
                    <p className="mt-3 text-[15px] font-medium text-stone-800">You&apos;re all caught up</p>
                    <p className="mt-1 text-[14px] text-stone-500">Mentions in notes, chats assigned to you, campaign reports and template reviews show up here.</p>
                  </div>
                )}
                {items?.map((n) => {
                  const g = group(n.at);
                  const head = g !== lastGroup;
                  lastGroup = g;
                  return (
                    <div key={n.id}>
                      {head && <p className="px-5 pb-1.5 pt-4 text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">{g}</p>}
                      <div className={cx("group flex gap-3.5 px-5 py-3.5 transition hover:bg-stone-50", !n.read && "bg-emerald-50/50")}>
                        <button type="button" onClick={() => go(n)} className="flex min-w-0 flex-1 gap-3.5 text-left">
                          <Face n={n} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] leading-snug text-stone-900">{n.title}</span>
                            {n.body && <span className={cx("mt-1.5 line-clamp-3 block rounded-xl px-3 py-2 text-[14px]", n.kind === "MENTION" ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : n.tone === "bad" ? "bg-rose-50 text-rose-800" : "bg-stone-50 text-stone-600")}>{n.body}</span>}
                            <span className="mt-1 block text-[13px] text-stone-500">
                              {ago(n.at)} · {KIND[n.kind] ?? "Update"}
                            </span>
                          </span>
                        </button>
                        <span className="flex shrink-0 flex-col items-center gap-2 pt-1">
                          {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="New" />}
                          {!n.read && (
                            <button type="button" onClick={() => void mark([n.id])} className="rounded-md p-1 text-stone-400 hover:bg-white hover:text-emerald-700" aria-label="Mark as read" title="Mark as read">
                              <Check className="h-4 w-4" aria-hidden />
                            </button>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
