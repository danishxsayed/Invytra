"use client";

import { BadgeCheck, Bookmark, BookmarkCheck, ChevronDown, ExternalLink, Globe, Mail, MapPin, Phone, Send, Sparkles, Star } from "lucide-react";
import { forwardRef } from "react";
import type { InvyCard } from "@/lib/invy";
import { cx } from "../ui";
import { SocialLinks } from "./SocialLinks";

type Props = {
  b: InvyCard;
  selected: boolean;
  hovered: boolean;
  active: boolean;
  open: boolean;
  busy: boolean;
  onHover: (on: boolean) => void;
  onActivate: () => void;
  onToggle: () => void;
  onOpen: () => void;
  onSave: () => void;
  onOutreach: () => void;
};

const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return u ?? "";
  }
};

function WebsiteChip({ b }: { b: InvyCard }) {
  const c = b.check;
  const s = c?.status ?? (b.website ? "ok" : "none");
  const [cls, text] =
    s === "none"
      ? ["bg-amber-50 text-amber-800 ring-amber-200", "No website on Google listing"]
      : s === "social"
        ? ["bg-amber-50 text-amber-800 ring-amber-200", `Only a social page (${host(c?.url)})`]
        : s === "broken"
          ? ["bg-rose-50 text-rose-700 ring-rose-200", "Website didn't load"]
          : ["bg-emerald-50 text-emerald-800 ring-emerald-200", host(b.website)];
  return <span className={cx("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[12px] font-medium ring-1", cls)}>
    <Globe className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{text}</span>
  </span>;
}

/** One business found: checked facts (with their source) apart from Invy's take (AI). */
export const BusinessCard = forwardRef<HTMLLIElement, Props>(function BusinessCard({ b, selected, hovered, active, open, busy, ...on }, ref) {
  const c = b.check;
  const checked = c?.checkedAt ? new Date(c.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
  return (
    <li
      ref={ref}
      onMouseEnter={() => on.onHover(true)}
      onMouseLeave={() => on.onHover(false)}
      className={cx(
        "rounded-2xl border bg-white p-3.5 transition",
        selected ? "border-stone-900 ring-2 ring-brand-400" : active ? "border-sky-400 ring-2 ring-sky-200" : hovered ? "border-stone-300 shadow-md" : "border-stone-200 shadow-sm",
      )}
    >
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={on.onToggle} aria-label={`Select ${b.name}`} className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-stone-900" />
        <button
          type="button"
          onClick={on.onActivate}
          title="Show on the map"
          className={cx(
            "grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-1 text-[12px] font-bold",
            selected ? "bg-brand-400 text-stone-900 ring-2 ring-stone-900" : "bg-stone-900 text-white",
          )}
        >
          {b.n}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={on.onActivate} className="block w-full text-left">
            <p className="truncate text-[15px] font-semibold text-stone-900">{b.name}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-stone-500">
              {b.category && <span>{b.category}</span>}
              {b.rating != null && (
                <span className="inline-flex items-center gap-0.5">
                  · <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden /> {b.rating.toFixed(1)} ({b.reviews ?? 0})
                </span>
              )}
            </p>
          </button>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <WebsiteChip b={b} />
            {b.saved && <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-700"><BookmarkCheck className="h-3 w-3" aria-hidden /> Saved</span>}
          </div>
        </div>
      </div>

      <ul className="mt-2.5 space-y-1 text-[13px] text-stone-600">
        {b.address && <li className="flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />{b.address}</li>}
        {b.phone && <li className="flex gap-1.5"><Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden /><a href={`tel:${b.phone.replace(/\s/g, "")}`} className="hover:underline">{b.phone}</a></li>}
        {b.emails.length > 0 && (
          <li className="flex gap-1.5">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {b.emails.map((e) => (
                <a key={e} href={`mailto:${e}`} onClick={(ev) => ev.stopPropagation()} className="block hover:underline">{e}</a>
              ))}
              <span className="text-[12px] text-stone-400">on its website</span>
            </span>
          </li>
        )}
      </ul>
      <SocialLinks links={b.socials} className="mt-2" />

      {b.reasons.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-emerald-50/60 px-3 py-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Checked</p>
          <ul className="mt-1 space-y-0.5 text-[13px] text-stone-700">
            {b.reasons.map((r, i) => (
              <li key={i}>
                {r.text}{" "}
                <span className="text-[12px] text-stone-400">
                  ({r.source === "listing" ? (b.mapsUrl ? <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="underline">Google listing</a> : "Google listing") : <>website check{checked ? `, ${checked}` : ""}</>})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(b.why || b.opportunity) && (
        <div className="mt-2 rounded-xl bg-stone-50 px-3 py-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Invy&apos;s take (AI)</p>
          {b.why && <p className="mt-1 text-[13px] text-stone-700">{b.why}</p>}
          {b.opportunity && <p className="mt-1.5 text-[13px]"><span className="text-stone-500">Opportunity: </span><span className="font-medium text-stone-900">{b.opportunity}</span></p>}
        </div>
      )}

      {open && c && c.status === "ok" && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-stone-100 px-3 py-2 text-[12px]">
          <dt className="text-stone-500">Opens securely</dt><dd>{c.https ? "Yes (HTTPS)" : "No"}</dd>
          <dt className="text-stone-500">Set up for phones</dt><dd>{c.mobileFriendly ? "Yes" : "No"}</dd>
          <dt className="text-stone-500">Copyright year</dt><dd>{c.copyrightYear ?? "Not shown"}</dd>
          <dt className="text-stone-500">Online booking</dt><dd>{c.booking ?? "None found"}</dd>
          <dt className="text-stone-500">Online ordering</dt><dd>{c.ordering ?? "None found"}</dd>
          {c.generator && (<><dt className="text-stone-500">Built with</dt><dd>{c.generator}</dd></>)}
          {c.title && (<><dt className="text-stone-500">Page title</dt><dd className="truncate">{c.title}</dd></>)}
        </dl>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={on.onOpen} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-stone-600 hover:bg-stone-100">
          <ChevronDown className={cx("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden /> {open ? "Less" : "Details"}
        </button>
        {b.mapsUrl && (
          <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-stone-600 hover:bg-stone-100">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open in Maps
          </a>
        )}
        {b.website && c?.status !== "social" && (
          <a href={b.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-stone-600 hover:bg-stone-100">
            <Globe className="h-3.5 w-3.5" aria-hidden /> Website
          </a>
        )}
        <span className="flex-1" />
        <button type="button" disabled={busy || b.saved} onClick={on.onSave} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[12px] font-semibold text-stone-700 hover:border-stone-300 disabled:opacity-50">
          <Bookmark className="h-3.5 w-3.5" aria-hidden /> {b.saved ? "Saved" : "Add to leads"}
        </button>
        <button type="button" disabled={busy} onClick={on.onOutreach} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2 py-1 text-[12px] font-semibold text-white hover:bg-stone-700 disabled:opacity-50">
          <Send className="h-3.5 w-3.5" aria-hidden /> Start outreach
        </button>
      </div>
    </li>
  );
});
