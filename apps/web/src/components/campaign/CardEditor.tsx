"use client";

import { CARD_FONTS, CARD_FONT_LABEL, CARD_INKS, CARD_INK_LABEL, CARD_STYLES, CARD_STYLE_LABEL, CARD_TEXT_MAX, DEFAULT_CARD, cardStarter, type Card } from "@invytra/shared";
import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../ui";

const SAMPLE: Record<string, string> = { firstName: "Alex", first_name: "Alex", lastName: "Morgan", last_name: "Morgan", name: "Alex Morgan", fullName: "Alex Morgan", company: "Acme", company_name: "Acme", title: "Founder" };

/** The text with variables filled in for the preview: sample values, else their fallback, else the name. */
export function sampleCardText(text: string): string {
  return text.replace(/\{\{?\s*([\w:]+)\s*(?:\|([^}]*))?\}\}?/g, (_m, key: string, fb?: string) => SAMPLE[key] ?? fb?.trim() ?? key);
}

/**
 * "Add a handwritten note": a letter written in pen for each person (2 AI credits), sent as a
 * picture with a LinkedIn message or shown at the top of an email. Live preview.
 */
export function CardEditor({ card, onChange, disabled, vars = "{firstName}" }: { card?: Card; onChange: (c: Card | undefined) => void; disabled?: boolean; vars?: string }) {
  const on = !!card;
  const c = card ?? DEFAULT_CARD;
  const ink = c.ink ?? "blue";
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setSrc(`/api/card-preview?${new URLSearchParams({ text: sampleCardText(c.text), style: c.style, font: c.font, ink })}`), 500);
    return () => clearTimeout(t);
  }, [on, c.text, c.style, c.font, ink]);

  const pick = <T extends string>(label: string, values: readonly T[], names: Record<T, string>, value: T, set: (v: T) => void) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {values.map((v) => (
        <button key={v} type="button" disabled={disabled} onClick={() => set(v)} className={chip(value === v)}>
          {names[v]}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cx("mt-2 rounded-xl border px-3.5 py-2.5", on ? "border-blue-200 bg-blue-50/40" : "border-stone-200 bg-white")}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-blue-700" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked ? { ...DEFAULT_CARD, text: cardStarter(vars) } : undefined)} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 text-[14.5px] font-medium text-stone-900">
            <PenLine className="h-4 w-4 text-blue-800" aria-hidden /> Add a handwritten note
            <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-blue-800 ring-1 ring-blue-200">2 AI credits each</span>
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
            A letter written in pen on paper, with their name, made for each person and sent as a picture. Out of credits, it goes without the note.
          </span>
        </span>
      </label>
      {on && (
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] leading-relaxed focus:border-stone-500 focus:outline-none"
            rows={9}
            value={c.text}
            disabled={disabled}
            maxLength={CARD_TEXT_MAX}
            onChange={(e) => onChange({ ...c, text: e.target.value })}
            aria-label="What the note says"
          />
          <div className="flex justify-between gap-3 text-[12px] text-stone-500">
            <span>
              Use {vars} for their name. Put *stars* around words to underline them in red. An empty line leaves a gap.
            </span>
            <span className="shrink-0">
              {c.text.length}/{CARD_TEXT_MAX}
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              {pick("Handwriting", CARD_FONTS, CARD_FONT_LABEL, c.font, (font) => onChange({ ...c, font }))}
              {pick("Paper", CARD_STYLES, CARD_STYLE_LABEL, c.style, (style) => onChange({ ...c, style }))}
              {pick("Ink", CARD_INKS, CARD_INK_LABEL, ink, (v) => onChange({ ...c, ink: v }))}
            </div>
            <div className="max-h-[420px] w-[260px] max-w-full overflow-y-auto rounded-lg border border-stone-200 bg-stone-100 shadow-sm">
              {src ? <img src={src} alt="Preview of the handwritten note" className="block h-auto w-full" /> : <div className="aspect-[3/4]" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const chip = (on: boolean) =>
  cx("rounded-full border px-3 py-1 text-[13px] transition-colors", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-400");
