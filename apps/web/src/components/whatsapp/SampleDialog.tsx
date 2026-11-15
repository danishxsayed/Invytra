"use client";

import { waVariables, type WaTemplateDraft } from "@invytra/shared";
import { ClipboardList, Loader2, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { btn } from "../btn";
import { cx } from "../ui";

/** The variables Meta needs a sample value for: the text header's {{1}}, each body {{n}} and each link's {{1}}. */
export function sampleSlots(t: WaTemplateDraft) {
  const slots: { key: string; label: string; hint: string; value: string }[] = [];
  if (t.header.type === "TEXT" && waVariables(t.header.text).length) slots.push({ key: "header", label: "{{1}}", hint: "Header", value: t.header.example ?? "" });
  [...new Set(waVariables(t.body))].sort((a, b) => a - b).forEach((n) => slots.push({ key: `body:${n}`, label: `{{${n}}}`, hint: "Body", value: t.bodyExamples[n - 1] ?? "" }));
  t.buttons.forEach((b, i) => {
    if (b.type === "URL" && waVariables(b.url).length) slots.push({ key: `url:${i}`, label: "{{1}}", hint: `Button ${i + 1} full link`, value: b.example ?? "" });
  });
  return slots;
}

function withSamples(t: WaTemplateDraft, v: Record<string, string>): WaTemplateDraft {
  const bodyExamples = [...t.bodyExamples];
  for (const [k, val] of Object.entries(v)) if (k.startsWith("body:")) bodyExamples[Number(k.slice(5)) - 1] = val.trim();
  return {
    ...t,
    header: t.header.type === "TEXT" && "header" in v ? { ...t.header, example: v.header!.trim() } : t.header,
    bodyExamples,
    buttons: t.buttons.map((b, i) => (b.type === "URL" && `url:${i}` in v ? { ...b, example: v[`url:${i}`]!.trim() } : b)),
  };
}

const PLACEHOLDER: Record<string, string> = { "body:1": "e.g. Sara", "body:2": "e.g. Sunday", header: "e.g. Acme" };

/** Asked on "Submit to Meta": a real example for every variable, for Meta's reviewers only. */
export function SampleDialog({ t, pending, error, onCancel, onConfirm }: { t: WaTemplateDraft; pending: boolean; error: string | null; onCancel: () => void; onConfirm: (draft: WaTemplateDraft) => void }) {
  const slots = sampleSlots(t);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(slots.map((s) => [s.key, s.value])));
  const first = useRef<HTMLInputElement>(null);
  const ready = slots.every((s) => v[s.key]?.trim());
  const cancel = useRef(onCancel);
  cancel.current = pending ? () => {} : onCancel;
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cancel.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sample-title" onMouseDown={(e) => e.target === e.currentTarget && !pending && onCancel()}>
      <form
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !pending) onConfirm(withSamples(t, v));
        }}
      >
        <div className="flex gap-4 p-5 sm:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="sample-title" className="text-[17px] font-semibold text-stone-900">
              Provide sample content
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-stone-500">Meta needs a real example for each variable so reviewers can judge your template. These are for review only, never sent to contacts.</p>
          </div>
        </div>
        <div className="border-y border-emerald-100 bg-emerald-50/40 px-5 py-4 sm:px-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-500">Template body</p>
          <p className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap text-[14px] italic leading-relaxed text-stone-600">
            &ldquo;
            {t.body.split(/(\{\{\s*\d+\s*\}\})/g).map((p, i) =>
              /^\{\{/.test(p) ? (
                <span key={i} className="rounded bg-emerald-100 px-1 font-mono text-[12.5px] not-italic text-emerald-800">
                  {v[`body:${p.replace(/\D/g, "")}`]?.trim() || p.replace(/\s/g, "")}
                </span>
              ) : (
                <Fragment key={i}>{p}</Fragment>
              ),
            )}
            &rdquo;
          </p>
        </div>
        <div className="max-h-[40vh] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {slots.map((s, i) => {
            const empty = !v[s.key]?.trim();
            return (
              <label key={s.key} className="block">
                <span className="mb-1.5 flex items-center gap-2 text-[13.5px]">
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{s.label}</span>
                  <span className="font-medium text-stone-600">{s.hint} sample</span>
                  {empty && <span className="text-[12.5px] font-medium text-rose-500">required</span>}
                </span>
                <input
                  ref={i === 0 ? first : undefined}
                  className={cx("w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2", empty ? "border-rose-300 focus:ring-rose-200" : "border-stone-200 focus:ring-emerald-200")}
                  value={v[s.key] ?? ""}
                  onChange={(e) => setV({ ...v, [s.key]: e.target.value })}
                  placeholder={s.key.startsWith("url:") ? "https://company.com/offer/diwali" : (PLACEHOLDER[s.key] ?? "e.g. a real value")}
                />
              </label>
            );
          })}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13.5px] text-rose-800" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 px-5 py-4 sm:px-6">
          <button type="button" onClick={onCancel} disabled={pending} className={btn.secondary}>
            Cancel
          </button>
          <button type="submit" disabled={!ready || pending} className={btn.primary}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Confirm &amp; submit
          </button>
        </div>
      </form>
    </div>
  );
}
