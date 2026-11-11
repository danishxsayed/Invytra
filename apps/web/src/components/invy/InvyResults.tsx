"use client";

import { ArrowLeft, ArrowUp, Bookmark, Download, Loader2, Mail, MessageCircle, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { emailBusinessesAction, followUpAction, saveBusinessesAction } from "@/app/workspace/invy/actions";
import type { InvySearchView } from "@/lib/invy";
import { Modal } from "../Modal";
import { cx } from "../ui";
import { BusinessCard } from "./BusinessCard";
import { InvyLoader } from "./InvyLoader";
import { InvyMap, type Pin } from "./InvyMap";

/** Ask Invy results: the map (70%) and Invy's reasoning with the businesses (30%), in sync. */
export function InvyResults({ s, home }: { s: InvySearchView; home: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; tick: number } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [outreach, setOutreach] = useState<string[] | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [pending, start] = useTransition();
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const working = s.status === "QUEUED" || s.status === "RUNNING";

  // While Invy works, check back every 2 seconds.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [working, router]);

  const pins: Pin[] = useMemo(() => s.cards.map((c) => ({ id: c.id, n: c.n, name: c.name, address: c.address, lat: c.lat, lng: c.lng })), [s.cards]);
  const ids = s.cards.map((c) => c.id);
  const toggle = (id: string) =>
    setSelected((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Picked on the map: open it and bring its card into view. */
  const pickFromMap = (id: string) => {
    setActive(id);
    cardRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  /** Picked on a card: open it and show it on the map. */
  const pickFromCard = (id: string) => {
    setActive(id);
    setFocus({ id, tick: Date.now() });
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (!r.ok) return setNote({ text: r.error ?? "Something went wrong.", bad: true });
      if (okText) setNote({ text: okText });
      router.refresh();
    });

  const send = () => {
    const t = msg.trim();
    if (!t || working) return;
    setMsg("");
    run(() => followUpAction(s.id, t));
  };

  const last = [...s.messages].reverse().find((m) => m.role === "invy");
  const chosen = outreach ? s.cards.filter((c) => outreach.includes(c.id)) : [];
  const withEmail = chosen.filter((c) => c.emails.length).length;
  const withPhone = chosen.filter((c) => c.phone).length;
  const csvHref = (list: string[]) => `/api/invy/${s.id}/csv${list.length ? `?ids=${list.join(",")}` : ""}`;

  return (
    <div className="-mx-4 -mt-8 flex flex-col bg-[#faf9f5] sm:-mx-8 lg:fixed lg:inset-y-0 lg:left-[264px] lg:right-0 lg:z-10 lg:m-0">
      {/* Top bar: counts and bulk actions */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-4 py-3">
        <a href={home} className="inline-flex items-center gap-1 text-[14px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Ask Invy
        </a>
        <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-stone-900">{s.title}</h1>
        <p className="text-[13px] text-stone-500">
          <b className="text-stone-900">{s.cards.length}</b> matching · <b className="text-stone-900">{selected.size}</b> selected
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={!s.cards.length} onClick={() => setSelected(selected.size === ids.length ? new Set() : new Set(ids))} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40">
            {selected.size === ids.length && ids.length ? "Clear" : "Select all"}
          </button>
          <button type="button" disabled={!selected.size || pending} onClick={() => run(() => saveBusinessesAction(s.id, [...selected]), `Saved ${selected.size} to your leads.`)} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-stone-700 hover:border-stone-300 disabled:opacity-40">
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Add to leads
          </button>
          <a href={csvHref([...selected])} aria-disabled={!s.cards.length} className={cx("inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-stone-700 hover:border-stone-300", !s.cards.length && "pointer-events-none opacity-40")}>
            <Download className="h-3.5 w-3.5" aria-hidden /> CSV{selected.size ? ` (${selected.size})` : ""}
          </a>
          <button type="button" disabled={!selected.size} onClick={() => setOutreach([...selected])} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-stone-700 disabled:opacity-40">
            Start outreach{selected.size ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
        <div className="relative h-[45vh] min-h-[280px] lg:h-full">
          {working && !s.cards.length && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-[2px]">
              <div className="flex flex-col items-center rounded-3xl bg-white/90 px-8 py-6 shadow-lg ring-1 ring-stone-200">
                <InvyLoader size={160} />
                <p className="mt-1 max-w-[260px] text-center text-[14px] font-medium text-stone-700">{s.progress ?? "Getting started…"}</p>
              </div>
            </div>
          )}
          <InvyMap pins={pins} selected={selected} hovered={hovered} active={active} focus={focus} onHover={setHovered} onPick={pickFromMap} onToggle={toggle} />
        </div>

        <aside className="flex min-h-0 flex-col border-l border-stone-200 bg-[#faf9f5]">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
            {/* Invy's reasoning */}
            <section className="rounded-2xl border border-stone-200 bg-white p-3.5">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-900">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-stone-900 text-white"><Sparkles className="h-3.5 w-3.5" aria-hidden /></span> Invy
              </p>
              {working ? (
                <div className="mt-1 flex items-center gap-3">
                  <InvyLoader size={72} />
                  <p className="text-[14px] text-stone-600" aria-live="polite">{s.progress ?? "Working…"}</p>
                </div>
              ) : (
                <>
                  {last && <p className={cx("mt-2 text-[14px] leading-relaxed", s.status === "FAILED" ? "text-rose-700" : "text-stone-800")}>{last.text}</p>}
                  {s.summary && s.status !== "FAILED" && <p className="mt-2 text-[13px] leading-relaxed text-stone-600">{s.summary}</p>}
                </>
              )}
              <p className="mt-2 text-[12px] text-stone-400">
                {s.looked} businesses looked at · {s.creditsUsed} AI credits used. “Checked” facts come from Google listings and the businesses&apos; own websites; “Invy&apos;s take” is AI.
              </p>
              {s.messages.length > 2 && (
                <button type="button" onClick={() => setShowChat((x) => !x)} className="mt-1.5 text-[12px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-800">
                  {showChat ? "Hide the conversation" : `Show the conversation (${s.messages.length})`}
                </button>
              )}
              {showChat && (
                <ol className="mt-2 space-y-1.5">
                  {s.messages.map((m, i) => (
                    <li key={i} className={cx("rounded-xl px-3 py-1.5 text-[13px]", m.role === "user" ? "ml-6 bg-stone-900 text-white" : "mr-6 bg-stone-100 text-stone-800")}>
                      {m.text}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {note && (
              <p role="status" className={cx("flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]", note.bad ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800")}>
                <span className="flex-1">{note.text}</span>
                <button type="button" aria-label="Dismiss" onClick={() => setNote(null)}><X className="h-3.5 w-3.5" aria-hidden /></button>
              </p>
            )}

            <ol className="space-y-2.5">
              {s.cards.map((b) => (
                <BusinessCard
                  key={b.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(b.id, el);
                    else cardRefs.current.delete(b.id);
                  }}
                  b={b}
                  selected={selected.has(b.id)}
                  hovered={hovered === b.id}
                  active={active === b.id}
                  open={open.has(b.id)}
                  busy={pending}
                  onHover={(on) => setHovered(on ? b.id : null)}
                  onActivate={() => pickFromCard(b.id)}
                  onToggle={() => toggle(b.id)}
                  onOpen={() => setOpen((x) => (x.has(b.id) ? new Set([...x].filter((y) => y !== b.id)) : new Set([...x, b.id])))}
                  onSave={() => run(() => saveBusinessesAction(s.id, [b.id]), `Saved ${b.name} to your leads.`)}
                  onOutreach={() => setOutreach([b.id])}
                />
              ))}
            </ol>
          </div>

          {/* Follow-ups */}
          <form
            className="border-t border-stone-200 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-stone-500">
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={500}
                disabled={working}
                placeholder={working ? "Invy is working…" : "Refine: “10 more”, “only in Koramangala”, “rated 4+”"}
                className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-[14px] focus:outline-none"
              />
              <button type="submit" disabled={!msg.trim() || working || pending} aria-label="Send" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-900 text-white disabled:opacity-30">
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </form>
        </aside>
      </div>

      {outreach && (
        <Modal title={`Start outreach to ${chosen.length} business${chosen.length === 1 ? "" : "es"}`} onClose={() => setOutreach(null)} busy={pending}>
          <div className="space-y-3 text-[14px] text-stone-600">
            <button
              type="button"
              disabled={!withEmail || pending}
              onClick={() =>
                start(async () => {
                  const r = await emailBusinessesAction(s.id, outreach);
                  if (!r.ok) return setNote({ text: r.error, bad: true }), setOutreach(null);
                  window.location.href = r.value.href;
                })
              }
              className="flex w-full items-start gap-3 rounded-xl border border-stone-200 p-3 text-left transition hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="mt-0.5 h-5 w-5 text-stone-700" aria-hidden />
              <span className="flex-1">
                <span className="block font-semibold text-stone-900">Email campaign</span>
                <span className="block">
                  {withEmail ? `${withEmail} of ${chosen.length} have a public email on their website.` : "None of these has a public email address."} Opens a draft campaign: nothing is sent until you
                  write it and launch it.
                </span>
              </span>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            </button>
            <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 opacity-80">
              <MessageCircle className="mt-0.5 h-5 w-5 text-stone-500" aria-hidden />
              <span className="flex-1">
                <span className="flex items-center gap-2 font-semibold text-stone-700">
                  WhatsApp <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Coming soon</span>
                </span>
                <span className="block">{withPhone} have a phone number on Google. Save them now and message them when WhatsApp opens.</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={pending} onClick={() => (run(() => saveBusinessesAction(s.id, outreach), `Saved ${outreach.length} to your leads.`), setOutreach(null))} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] font-semibold text-stone-700 hover:border-stone-300">
                <Bookmark className="h-3.5 w-3.5" aria-hidden /> Add to leads
              </button>
              <a href={csvHref(outreach)} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-[13px] font-semibold text-stone-700 hover:border-stone-300">
                <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
              </a>
            </div>
            <p className="text-[12px] text-stone-400">Only contact businesses at details they publish for enquiries, and respect anyone who opts out. Every campaign email has an unsubscribe link.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
