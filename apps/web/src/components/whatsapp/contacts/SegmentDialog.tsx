"use client";

import { SEGMENT_COLORS, SEGMENT_FIELDS, newRule, tagLabel, type SegmentColor, type SegmentField, type SegmentRule } from "@invytra/shared";
import { Check, Filter, Loader2, Plus, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { previewSegmentAction, saveSegmentAction } from "@/app/whatsapp/contacts/actions";
import { btn } from "../../btn";
import { Portal } from "../../Portal";
import { cx } from "../../ui";

export interface SegmentDraft {
  id?: string;
  name: string;
  color: SegmentColor;
  match: "all" | "any";
  rules: SegmentRule[];
}

const sel = "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] text-stone-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100";

/** New (or edit) segment: a name, a color and rules; shows how many contacts match as you go. */
export function SegmentDialog({ tags, initial, onClose }: { tags: string[]; initial?: SegmentDraft; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<SegmentDraft>(initial ?? { name: "", color: "green", match: "all", rules: [newRule("tag", tags)] });
  const [preview, setPreview] = useState<{ count: number; names: string[] } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const setRule = (i: number, r: Partial<SegmentRule>) => setD((x) => ({ ...x, rules: x.rules.map((y, j) => (j === i ? { ...y, ...r } : y)) }));

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => void previewSegmentAction({ match: d.match, rules: d.rules }).then((r) => live && setPreview(r)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [d.match, d.rules]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const ready = d.name.trim() && preview && !("error" in preview);
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveSegmentAction(d.id ?? null, { name: d.name, color: d.color, match: d.match, rules: d.rules });
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="seg-title">
        <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Filter className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1">
              <h2 id="seg-title" className="text-[21px] font-semibold text-stone-900">
                {d.id ? "Edit segment" : "New segment"}
              </h2>
              <p className="text-[15px] text-stone-500">Contacts join and leave automatically as they match the rules.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-[14px] text-stone-600">Segment name</span>
              <input className={cx(sel, "mt-1.5")} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. VIP customers in Mumbai" maxLength={80} autoFocus />
            </label>
            <div>
              <span className="text-[14px] text-stone-600">Color</span>
              <div className="mt-2.5 flex gap-2.5" role="radiogroup" aria-label="Color">
                {(Object.keys(SEGMENT_COLORS) as SegmentColor[]).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={c} onClick={() => setD({ ...d, color: c })} className={cx("h-8 w-8 rounded-full transition", d.color === c && "ring-[3px] ring-offset-2")} style={{ background: SEGMENT_COLORS[c], ["--tw-ring-color" as string]: SEGMENT_COLORS[c] }} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl p-5 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center gap-3 text-[15.5px] text-stone-800">
              Include contacts that match
              <span className="inline-flex rounded-xl bg-stone-100 p-1">
                {(["all", "any"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={d.match === m} onClick={() => setD({ ...d, match: m })} className={cx("rounded-lg px-3.5 py-1 text-[15px]", d.match === m ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500")}>
                    {m}
                  </button>
                ))}
              </span>
              of these rules
            </div>
            <div className="mt-4 space-y-3">
              {d.rules.map((r, i) => {
                const f = SEGMENT_FIELDS[r.field];
                const opts = f.value && typeof f.value === "object" ? (f.value as Record<string, string>) : null;
                return (
                  <div key={i} className="grid items-center gap-2 sm:grid-cols-[64px_1fr_0.9fr_1fr_36px]">
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-stone-500">{i === 0 ? "Where" : d.match === "all" ? "And" : "Or"}</span>
                    <select className={sel} value={r.field} onChange={(e) => setRule(i, newRule(e.target.value as SegmentField, tags))} aria-label="Field">
                      {(Object.keys(SEGMENT_FIELDS) as SegmentField[]).map((k) => (
                        <option key={k} value={k}>
                          {SEGMENT_FIELDS[k].label}
                        </option>
                      ))}
                    </select>
                    <select className={sel} value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} aria-label="Condition">
                      {Object.entries(f.ops).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {f.value === "tag" ? (
                      <select className={sel} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Tag">
                        {!tags.length && <option value="">No tags yet</option>}
                        {tags.map((t) => (
                          <option key={t} value={t}>
                            {tagLabel(t)}
                          </option>
                        ))}
                      </select>
                    ) : opts ? (
                      <select className={sel} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Value">
                        {Object.entries(opts).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : f.value === "days" ? (
                      <span className="flex items-center gap-2">
                        <input className={sel} inputMode="numeric" value={r.value} onChange={(e) => setRule(i, { value: e.target.value.replace(/\D/g, "").slice(0, 4) })} aria-label="Days" />
                        <span className="text-[14px] text-stone-500">days{r.op === "before" ? " ago" : ""}</span>
                      </span>
                    ) : f.value === "text" ? (
                      <input className={sel} value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} placeholder="e.g. Mumbai" aria-label="Value" />
                    ) : (
                      <span />
                    )}
                    <button type="button" disabled={d.rules.length === 1} onClick={() => setD({ ...d, rules: d.rules.filter((_, j) => j !== i) })} className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-rose-600 disabled:opacity-30" aria-label="Remove rule">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
            {d.rules.length < 20 && (
              <button type="button" onClick={() => setD({ ...d, rules: [...d.rules, newRule("location", tags)] })} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-emerald-700 hover:text-emerald-900 sm:ml-[72px]">
                <Plus className="h-4 w-4" aria-hidden /> Add rule
              </button>
            )}
          </div>

          <div className="mt-5 flex items-center gap-4 rounded-2xl bg-emerald-50/70 px-5 py-4">
            <Users className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
            {!preview ? (
              <p className="text-[15px] text-stone-500">Counting…</p>
            ) : "error" in preview ? (
              <p className="text-[15px] text-amber-800">{preview.error}</p>
            ) : (
              <div>
                <p className="text-[16.5px] font-semibold text-stone-900">
                  Matches {preview.count.toLocaleString("en-US")} contact{preview.count === 1 ? "" : "s"}
                </p>
                {preview.names.length > 0 && <p className="text-[14px] text-stone-500">e.g. {preview.names.join(", ")}</p>}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className={cx(btn.secondary, "px-6 py-2.5")} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={cx(btn.primary, "px-6 py-2.5")} disabled={!ready || pending} onClick={save}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Save segment
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
