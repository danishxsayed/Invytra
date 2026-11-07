"use client";

import { CARD_FONTS, CARD_FONT_LABEL, CARD_STYLES, CARD_STYLE_LABEL, CARD_TEXT_MAX, DEFAULT_CARD, type Card } from "@invytra/shared";
import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../ui";

const SAMPLE: Record<string, string> = { firstName: "Alex", first_name: "Alex", lastName: "Morgan", last_name: "Morgan", fullName: "Alex Morgan", company: "Acme", companyName: "Acme" };

/** The text with variables filled in for the preview: sample values, else their fallback, else the name. */
export function sampleCardText(text: string): string {
  return text.replace(/\{\{?\s*([\w:]+)\s*(?:\|([^}]*))?\}\}?/g, (_m, key: string, fb?: string) => SAMPLE[key] ?? fb?.trim() ?? key);
}

/**
 * "Add a handwritten card": a short note drawn in handwriting for each person (2 AI credits),
 * sent as an image with a LinkedIn message or shown at the top of an email. Live preview.
 */
export function CardEditor({ card, onChange, disabled, vars = "{firstName}" }: { card?: Card; onChange: (c: Card | undefined) => void; disabled?: boolean; vars?: string }) {
  const on = !!card;
  const c = card ?? DEFAULT_CARD;
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setSrc(`/api/card-preview?${new URLSearchParams({ text: sampleCardText(c.text), style: c.style, font: c.font })}`), 450);
    return () => clearTimeout(t);
  }, [on, c.text, c.style, c.font]);

  return (
    <div className={cx("mt-2 rounded-xl border px-3.5 py-2.5", on ? "border-amber-300 bg-amber-50/60" : "border-stone-200 bg-white")}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-amber-600" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked ? { ...DEFAULT_CARD, text: `Great to meet you, ${vars}!` } : undefined)} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 text-[14.5px] font-medium text-stone-900">
            <PenLine className="h-4 w-4 text-amber-700" aria-hidden /> Add a handwritten card
            <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-amber-800 ring-1 ring-amber-200">2 AI credits each</span>
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
            A short note drawn in handwriting, with their name, made for each person and sent as a picture. Out of credits, it goes without the card.
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] focus:border-stone-500 focus:outline-none"
            rows={2}
            value={c.text}
            disabled={disabled}
            maxLength={CARD_TEXT_MAX}
            onChange={(e) => onChange({ ...c, text: e.target.value })}
            placeholder={`e.g. Great to meet you, ${vars}! Loved your talk on hiring.`}
            aria-label="What the card says"
          />
          <div className="flex justify-between gap-3 text-[12px] text-stone-500">
            <span>Use {vars} for their name. Short notes look best (under 120 characters).</span>
            <span className="shrink-0">{c.text.length}/{CARD_TEXT_MAX}</span>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Card style">
                {CARD_STYLES.map((s) => (
                  <button key={s} type="button" disabled={disabled} onClick={() => onChange({ ...c, style: s })} className={chip(c.style === s)}>
                    {CARD_STYLE_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Handwriting">
                {CARD_FONTS.map((f) => (
                  <button key={f} type="button" disabled={disabled} onClick={() => onChange({ ...c, font: f })} className={chip(c.font === f)}>
                    {CARD_FONT_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-[240px] max-w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              {src ? <img src={src} alt="Preview of the handwritten card" className="block h-auto w-full" /> : <div className="aspect-[3/2]" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) =>
  cx("rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400");
