"use client";

import { tagColor, tagLabel } from "@invytra/shared";
import { Ban, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, CircleX, Copy, Download, FileSpreadsheet, Link2, Loader2, MapPin, Megaphone, MessageCircle, Tag, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteWaContactsAction, optOutWaContactsAction, tagWaContactsAction } from "@/app/whatsapp/contacts/actions";
import { cx } from "../../ui";

export interface WaContactView {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  phone: string;
  city: string | null;
  state: string | null;
  tags: string[];
  /** ON, NOT_FOUND or null (not known until a message reaches them) */
  wa: string | null;
  status: "subscribed" | "not_opted_in" | "opted_out";
  consent: { kind: "IMPORT" | "MANUAL" | "INBOUND" | "LINK" | "OPTED_OUT" | "NONE"; label: string; date: string };
}

const CONSENT_ICON = { IMPORT: FileSpreadsheet, MANUAL: UserPlus, INBOUND: MessageCircle, LINK: Link2, OPTED_OUT: Ban, NONE: CircleDashed } as const;
const CONSENT_TONE = { IMPORT: "bg-violet-50 text-violet-600", MANUAL: "bg-sky-50 text-sky-600", INBOUND: "bg-emerald-50 text-emerald-600", LINK: "bg-emerald-50 text-emerald-600", OPTED_OUT: "bg-rose-50 text-rose-600", NONE: "bg-stone-100 text-stone-400" } as const;
const initials = (n: string) =>
  n
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** The contacts table: tick rows, then tag, start a campaign, export, opt out or delete them together. */
export function WaContactTable({ rows, total, page, pages, prevHref, nextHref }: { rows: WaContactView[]; total: number; page: number; pages: number; prevHref: string | null; nextHref: string | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [ask, setAsk] = useState<"optout" | "delete" | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const ids = [...picked];
  const n = ids.length;
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  const plural = (k: number) => `${k} contact${k === 1 ? "" : "s"}`;

  const run = (fn: () => Promise<{ ok: true; value: number } | { ok: false; error: string }>, done: (k: number) => string, clear = true, then?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: done(r.value) } : { ok: false, text: r.error });
      setAsk(null);
      if (!r.ok) return;
      if (clear) setPicked(new Set());
      setTag("");
      setTagOpen(false);
      router.refresh();
      then?.();
    });
  // A campaign for the ticked people: they get a tag of their own, and the campaign targets it.
  const campaign = () => {
    const d = new Date();
    const t = `selected-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    run(() => tagWaContactsAction(ids, t, true), () => `Tagged ${plural(n)} "${t}" for the campaign.`, true, () => router.push(`/whatsapp/campaigns/new?tag=${encodeURIComponent(t)}`));
  };
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    setCopied(v);
    setTimeout(() => setCopied(null), 1200);
  };
  const action = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-emerald-800 hover:bg-emerald-100/70 disabled:opacity-50";

  return (
    <div className="space-y-3">
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-emerald-50/80 px-3 py-1.5 text-[14.5px] ring-1 ring-emerald-200">
          <span className="mr-2 font-semibold text-stone-900">{n} selected</span>
          <span className="relative">
            <button type="button" className={action} onClick={() => setTagOpen(!tagOpen)} aria-expanded={tagOpen}>
              <Tag className="h-4 w-4" aria-hidden /> Tag
            </button>
            {tagOpen && (
              <span className="absolute left-0 top-full z-20 mt-1 flex w-72 items-center gap-1 rounded-xl bg-white p-2 shadow-xl ring-1 ring-stone-200">
                <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tag.trim() && run(() => tagWaContactsAction(ids, tag, true), (k) => `Tag added to ${plural(k)}.`, false)} placeholder="Tag name" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[14px] focus:outline-none" aria-label="Tag" />
                <button type="button" disabled={!tag.trim() || pending} onClick={() => run(() => tagWaContactsAction(ids, tag, true), (k) => `Tag added to ${plural(k)}.`, false)} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[13.5px] font-semibold text-white disabled:opacity-40">
                  Add
                </button>
                <button type="button" disabled={!tag.trim() || pending} onClick={() => run(() => tagWaContactsAction(ids, tag, false), (k) => `Tag removed from ${plural(k)}.`, false)} className="rounded-lg px-2 py-1.5 text-[13.5px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40">
                  Remove
                </button>
              </span>
            )}
          </span>
          <button type="button" className={action} onClick={campaign} disabled={pending}>
            <Megaphone className="h-4 w-4" aria-hidden /> Campaign
          </button>
          <a className={action} href={`/whatsapp/contacts/export?ids=${ids.join(",")}`}>
            <Download className="h-4 w-4" aria-hidden /> Export
          </a>
          <button type="button" className={action} onClick={() => setAsk("optout")}>
            <Ban className="h-4 w-4" aria-hidden /> Opt out
          </button>
          <span className="mx-1 h-5 w-px bg-emerald-200" />
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-rose-600 hover:bg-rose-50" onClick={() => setAsk("delete")}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </button>
          <button type="button" onClick={() => (setPicked(new Set()), setAsk(null))} className="ml-auto rounded-lg p-1.5 text-stone-500 hover:bg-emerald-100/70" aria-label="Clear selection">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      {ask && (
        <div className="rounded-xl bg-rose-50 p-3 text-[14px] text-rose-900 ring-1 ring-rose-200">
          <p>{ask === "optout" ? `Opt out ${plural(n)}? They won't get WhatsApp messages again, and their numbers go on your do-not-contact list for every channel.` : `Delete ${plural(n)}? Opted-out numbers stay on your do-not-contact list, so they can't be imported back by mistake.`}</p>
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

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-[13.5px]">
            <thead className="border-b border-stone-100 text-[12px] font-semibold uppercase tracking-wider text-stone-500">
              <tr>
                <th className="w-12 py-3 pl-4">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all on this page" />
                </th>
                {["Name", "User ID", "Phone", "Location", "Tags", "WhatsApp", "Status", "Consent"].map((h) => (
                  <th key={h} className="px-2 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => {
                const Icon = CONSENT_ICON[r.consent.kind];
                const hue = tagColor(r.name);
                return (
                  <tr key={r.id} className={cx("align-middle", picked.has(r.id) && "bg-emerald-50/40")}>
                    <td className="py-3 pl-4">
                      <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold" style={{ background: `${hue}1f`, color: hue }}>
                          {initials(r.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[150px] truncate font-medium text-stone-900">{r.name}</span>
                          <span className={cx("block max-w-[150px] truncate text-[13px]", r.email ? "text-stone-500" : "text-stone-400")}>{r.email ?? "No email"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 font-mono text-[12.5px] text-stone-600">
                      {r.userId ? (
                        <span className="inline-flex items-center gap-1.5">
                          {r.userId}
                          <button type="button" onClick={() => copy(r.userId!)} className="text-stone-300 hover:text-stone-600" aria-label="Copy user ID" title={copied === r.userId ? "Copied" : "Copy"}>
                            {copied === r.userId ? <CircleCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                          </button>
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 tabular-nums text-stone-800">{r.phone}</td>
                    <td className="px-2 py-3">
                      {r.city ? (
                        <span className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                          <span>
                            <span className="block text-stone-800">{r.city}</span>
                            {r.state && <span className="block text-[13px] text-stone-500">{r.state}</span>}
                          </span>
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex max-w-[110px] flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <span key={t} className="whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 text-[12.5px] font-medium text-emerald-800">
                            {tagLabel(t)}
                          </span>
                        ))}
                        {r.tags.length > 3 && <span className="text-[12.5px] text-stone-500">+{r.tags.length - 3}</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {r.wa === "ON" ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <CircleCheck className="h-4 w-4" aria-hidden /> On WhatsApp
                        </span>
                      ) : r.wa === "NOT_FOUND" ? (
                        <span className="inline-flex items-center gap-1.5 text-stone-500">
                          <CircleX className="h-4 w-4" aria-hidden /> Not found
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-stone-400" title="Known after the first message reaches them, or when they write to you">
                          <CircleDashed className="h-4 w-4" aria-hidden /> Not checked
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <span className={cx("whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] font-medium", r.status === "opted_out" ? "bg-rose-50 text-rose-700" : r.status === "not_opted_in" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
                        {r.status === "opted_out" ? "Opted out" : r.status === "not_opted_in" ? "Not opted in" : "Subscribed"}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg", CONSENT_TONE[r.consent.kind])}>
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[125px] truncate text-stone-800">{r.consent.label}</span>
                          {r.consent.date && <span className="block text-[13px] text-stone-500">{r.consent.date}</span>}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3 text-[14px] text-stone-500">
          <span>
            Showing {rows.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
          </span>
          <span className="flex items-center gap-2">
            <PageLink href={prevHref} label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </PageLink>
            <span className="px-1 tabular-nums text-stone-700">
              {page} / {pages.toLocaleString("en-US")}
            </span>
            <PageLink href={nextHref} label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </PageLink>
          </span>
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = "grid h-8 w-9 place-items-center rounded-lg ring-1 ring-stone-200";
  return href ? (
    <Link href={href} scroll={false} aria-label={label} className={cx(cls, "text-stone-700 hover:bg-stone-50")}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cx(cls, "text-stone-300")}>
      {children}
    </span>
  );
}
