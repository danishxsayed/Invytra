"use client";

import { LEAD_IMPORT, type ColumnMapping, type LeadField, type LeadParseResult } from "@invytra/shared";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { cx } from "./ui";

const FIELD_LABEL: Record<LeadField, string> = {
  url: "LinkedIn profile link",
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  company: "Company",
  title: "Job title",
  location: "Location",
};
const EDITABLE: LeadField[] = ["url", "firstName", "lastName", "fullName", "company", "title"];

/** Which column is which. Pre-filled by detection; the person can correct it. */
export function MappingEditor({
  headers,
  sample,
  mapping,
  onChange,
}: {
  headers: string[];
  sample: string[][];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  const set = (field: LeadField, value: string) => {
    const next: ColumnMapping = { ...mapping };
    if (value === "") delete next[field];
    else {
      const idx = Number(value);
      for (const f of Object.keys(next) as LeadField[]) if (next[f] === idx) delete next[f];
      next[field] = idx;
    }
    onChange(next);
  };
  return (
    <div className="mt-4 rounded-xl border border-stone-200 p-4">
      <p className="text-[15px] font-semibold text-stone-900">Columns</p>
      <p className="text-[14px] text-stone-500">We matched these automatically. Change any that look wrong.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {EDITABLE.map((f) => {
          const idx = mapping[f];
          const example = idx === undefined ? "" : (sample.find((r) => r[idx]?.trim())?.[idx] ?? "");
          return (
            <label key={f} className="block">
              <span className={cx("text-[14px] font-medium", f === "url" ? "text-stone-900" : "text-stone-600")}>
                {FIELD_LABEL[f]}
                {f === "url" && <span className="text-rose-600"> *</span>}
              </span>
              <select
                value={idx === undefined ? "" : String(idx)}
                onChange={(e) => set(f, e.target.value)}
                className={cx(
                  "mt-1 block w-full rounded-lg border bg-white px-2.5 py-2 text-[15px] focus:outline-none focus:ring-4 focus:ring-brand-200",
                  f === "url" && idx === undefined ? "border-rose-300" : "border-stone-200",
                )}
              >
                <option value="">{f === "url" ? "Choose a column…" : "Not in this file"}</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
              {example && <span className="mt-0.5 block truncate text-[13px] text-stone-400">e.g. {example}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** What will be imported, before anything is saved. */
export function ImportPreview({ result }: { result: LeadParseResult }) {
  const [showBad, setShowBad] = useState(false);
  const n = result.leads.length;
  return (
    <div className="mt-4 space-y-2 text-[15px]">
      <p className={cx("flex items-center gap-2 font-medium", n ? "text-emerald-700" : "text-stone-500")}>
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        {n ? `${n.toLocaleString()} ${n === 1 ? "lead" : "leads"} ready to add` : "No LinkedIn profile links found yet"}
      </p>
      {result.duplicates > 0 && (
        <p className="flex items-center gap-2 text-stone-600">
          <Copy className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          {result.duplicates.toLocaleString()} duplicate{result.duplicates === 1 ? "" : "s"} in the file, added once
        </p>
      )}
      {result.overLimit > 0 && (
        <p className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {result.overLimit.toLocaleString()} more leads are over the {LEAD_IMPORT.maxLeads.toLocaleString()}-per-upload limit. Upload them separately.
        </p>
      )}
      {result.invalid.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowBad((v) => !v)} className="flex items-center gap-2 text-left text-amber-700 hover:text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {result.invalid.length.toLocaleString()} row{result.invalid.length === 1 ? "" : "s"} skipped · {showBad ? "hide" : "see why"}
          </button>
          {showBad && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-stone-50 px-3 py-2 text-[14px] text-stone-600">
              {result.invalid.slice(0, 50).map((r) => (
                <li key={`${r.row}-${r.value}`} className="truncate py-0.5">
                  <span className="text-stone-400">Row {r.row}:</span> {r.reason}
                  {r.value && <span className="text-stone-400"> ({r.value})</span>}
                </li>
              ))}
              {result.invalid.length > 50 && <li className="py-0.5 text-stone-400">…and {result.invalid.length - 50} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
