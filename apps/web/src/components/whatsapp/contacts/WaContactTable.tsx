"use client";

import { Ban, Loader2, Tag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteWaContactsAction, optOutWaContactsAction, tagWaContactsAction } from "@/app/whatsapp/contacts/actions";
import { cx } from "../../ui";

export interface WaContactView {
  id: string;
  phone: string;
  name: string;
  sub: string;
  tags: string[];
  consent: string;
  consentTitle: string;
  optedOut: string | null;
  /** Saved without WhatsApp consent: campaigns skip them. */
  noConsent?: boolean;
  added: string;
}

/** The contacts table: pick rows, then tag, opt out or delete them together. */
export function WaContactTable({ rows }: { rows: WaContactView[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [ask, setAsk] = useState<"optout" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = [...picked];
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));

  const run = (fn: () => Promise<{ ok: true; value: number } | { ok: false; error: string }>, done: (n: number) => string, clear = true) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done(r.value) } : { ok: false, text: r.error });
      setAsk(null);
      if (r.ok) {
        if (clear) setPicked(new Set());
        setTag("");
        router.refresh();
      }
    });
  const n = ids.length;
  const plural = (k: number) => `${k} contact${k === 1 ? "" : "s"}`;

  return (
    <div className="space-y-3">
      {n > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-[14px] text-white shadow-lg">
          <span className="font-medium">{n} selected</span>
          <button type="button" onClick={() => setPicked(new Set())} className="rounded p-1 text-white/60 hover:text-white" aria-label="Clear selection">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <span className="flex items-center gap-1 rounded-lg bg-white/10 pl-2">
            <Tag className="h-4 w-4 text-white/60" aria-hidden />
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag" className="w-28 bg-transparent py-1 text-white placeholder:text-white/40 focus:outline-none" aria-label="Tag" />
            <button type="button" disabled={!tag.trim() || pending} onClick={() => run(() => tagWaContactsAction(ids, tag, true), (k) => `Tag added to ${plural(k)}.`, false)} className="rounded-md px-2 py-1 font-medium hover:bg-white/10 disabled:opacity-40">
              Add
            </button>
            <button type="button" disabled={!tag.trim() || pending} onClick={() => run(() => tagWaContactsAction(ids, tag, false), (k) => `Tag removed from ${plural(k)}.`, false)} className="rounded-md px-2 py-1 font-medium hover:bg-white/10 disabled:opacity-40">
              Remove
            </button>
          </span>
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={() => setAsk("optout")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 hover:bg-white/10">
              <Ban className="h-4 w-4" aria-hidden /> Opt out
            </button>
            <button type="button" onClick={() => setAsk("delete")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-rose-200 hover:bg-white/10">
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </button>
          </span>
        </div>
      )}
      {ask && (
        <div className="rounded-xl bg-rose-50 p-3 text-[14px] text-rose-900 ring-1 ring-rose-200">
          {ask === "optout" ? (
            <p>Opt out {plural(n)}? They won&apos;t get WhatsApp messages again, and their numbers go on your do-not-contact list for every channel.</p>
          ) : (
            <p>Delete {plural(n)}? Opted-out numbers stay on your do-not-contact list, so they can&apos;t be imported back by mistake.</p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => (ask === "optout" ? run(() => optOutWaContactsAction(ids), (k) => `${plural(k)} opted out.`) : run(() => deleteWaContactsAction(ids), (k) => `${plural(k)} deleted.`))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {ask === "optout" ? "Opt out" : "Delete"}
            </button>
            <button type="button" onClick={() => setAsk(null)} className="font-medium underline">
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cx("rounded-lg px-3 py-2 text-[14px]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
          {msg.text}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-stone-50 text-[12.5px] text-stone-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" className="accent-lime-500" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all on this page" />
              </th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Tags</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Consent</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 bg-white">
            {rows.map((r) => (
              <tr key={r.id} className={cx(picked.has(r.id) && "bg-lime-50/60")}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" className="accent-lime-500" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="block font-medium text-stone-900">{r.name}</span>
                  <span className="block font-mono text-[13px] text-stone-500">{r.phone}</span>
                  {r.sub && <span className="block text-[12.5px] text-stone-400">{r.sub}</span>}
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <span className="flex max-w-[260px] flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[12px] font-medium text-stone-600">
                        {t}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-[13px] text-stone-500 lg:table-cell" title={r.consentTitle}>
                  {r.consent}
                </td>
                <td className="px-3 py-2.5">
                  {r.optedOut ? (
                    <span title={r.optedOut} className="rounded-full bg-stone-800 px-2 py-0.5 text-[12px] font-medium text-white">
                      Opted out
                    </span>
                  ) : (
                    r.noConsent ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-800">Not opted in</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">Opted in</span>
                    )
                  )}
                  <span className="mt-1 block text-[12px] text-stone-400">Added {r.added}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
