"use client";

import { DIAL_CODES, WA_IMPORT_FIELDS, applyPhoneMapping, detectPhoneMapping, fieldColumns, phoneMappingProblem, phoneTable, setFieldColumn, type WaColumnTarget, type WaImportField } from "@invytra/shared";
import { AlertTriangle, ArrowLeft, AtSign, CalendarClock, CheckCircle2, CircleCheck, Filter, Hash, Loader2, MapPin, Phone, Tag, Upload, User, Building2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { importWaContactsAction } from "@/app/whatsapp/contacts/actions";
import type { WaImportResult } from "@/lib/whatsapp-contacts";
import { btn } from "../../btn";
import { inputCls } from "../../fields";
import { Portal } from "../../Portal";
import { cx } from "../../ui";

const ICON: Record<WaImportField, typeof User> = { full_name: User, phone: Phone, country_code: Hash, email: AtSign, user_id: Hash, company_name: Building2, tags: Tag, consent: CircleCheck, appointment: CalendarClock, location: MapPin };
const select = "block w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[15px] text-stone-900 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200";

/** Full-screen: match the file's columns to Invytra's fields, check a preview, confirm consent, import. */
export function ImportMapper({ fileName, rows, csv, onClose, onClear }: { fileName: string; rows: string[][]; csv: string; onClose: () => void; onClear: () => void }) {
  const router = useRouter();
  const table = useMemo(() => phoneTable(rows), [rows]);
  const [mapping, setMapping] = useState<WaColumnTarget[]>(() => detectPhoneMapping(table));
  const [cc, setCc] = useState("91");
  const [step, setStep] = useState<"map" | "preview" | "done">("map");
  const [tags, setTags] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaImportResult | null>(null);

  const cols = fieldColumns(mapping);
  const problem = phoneMappingProblem(mapping);
  const parsed = useMemo(() => applyPhoneMapping(table, mapping, cc), [table, mapping, cc]);
  const sample = (i: number) => (i >= 0 ? (table.rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "").trim() : "");
  const extra = mapping.map((m, i) => ({ m, i })).filter((x) => x.m.startsWith("custom:"));
  const optedIn = parsed.contacts.filter((c) => c.consent !== false).length;
  const notOptedIn = parsed.contacts.length - optedIn;
  const headerLabel = (i: number) => table.headers[i] ?? `Column ${i + 1}`;

  const doImport = () =>
    start(async () => {
      setError(null);
      const r = await importWaContactsAction({ text: csv, mapping, defaultCountry: cc, tags, consent: consent || undefined });
      if (!r.ok) return setError(r.error);
      setResult(r.value);
      setStep("done");
      router.refresh();
    });

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#f3f1ec]" role="dialog" aria-modal="true" aria-label="Map file columns">
        <header className="flex items-center gap-4 border-b border-stone-200 bg-white px-5 py-4 sm:px-8">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Filter className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold text-stone-900">{step === "map" ? "Map file columns to Invytra fields" : step === "preview" ? "Check and import" : "Import finished"}</h2>
            <p className="truncate text-[14px] text-stone-500">
              <strong className="text-emerald-700">{table.rows.length.toLocaleString("en-US")}</strong> rows in <strong className="text-stone-800">{fileName}</strong>
              {step === "map" && " · choose which column holds each field."}
            </p>
          </div>
          {step !== "done" && (
            <button type="button" onClick={onClear} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-[14px] font-medium text-rose-600 hover:bg-rose-50">
              <X className="h-4 w-4" aria-hidden /> Clear file
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === "map" && (
            <div className="mx-auto grid max-w-6xl gap-4 px-5 py-6 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
              {WA_IMPORT_FIELDS.map((f) => {
                const Icon = ICON[f.key];
                const col = cols[f.key];
                const required = "required" in f && f.required;
                return (
                  <section key={f.key} className={cx("rounded-2xl bg-white p-5 ring-1", col >= 0 ? "ring-emerald-200" : "ring-stone-200")}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15.5px] font-semibold text-stone-900">{f.label}</p>
                          {sample(col) && <span className="max-w-[45%] truncate rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[12px] text-emerald-800 ring-1 ring-emerald-200">{sample(col)}</span>}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
                          <span className={cx("rounded px-1.5 py-px font-semibold uppercase tracking-wide", required ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200" : "bg-stone-50 text-stone-500 ring-1 ring-stone-200")}>{required ? "Required" : "Optional"}</span>
                          {"hint" in f && <span className="italic text-stone-500">{f.hint}</span>}
                        </p>
                      </div>
                    </div>
                    <select className={cx(select, "mt-4")} value={col} onChange={(e) => setMapping(setFieldColumn(table, mapping, f.key, Number(e.target.value)))} aria-label={`${f.label} column`}>
                      <option value={-1}>{f.key === "country_code" ? "— No column: use the default below —" : "— Not in this file —"}</option>
                      {table.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                    {col >= 0 ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Mapped to column: <strong>{headerLabel(col)}</strong>
                      </p>
                    ) : required ? (
                      <p className="mt-2 text-[13px] text-rose-600">Choose the column with the WhatsApp numbers.</p>
                    ) : null}
                    {f.key === "country_code" && (
                      <div className="mt-3 rounded-xl bg-emerald-50/50 p-3 ring-1 ring-emerald-100">
                        <p className="text-[13.5px] font-semibold text-stone-800">
                          Default country code <span className="text-rose-500">*</span>
                        </p>
                        <p className="text-[12.5px] text-stone-500">For numbers written without one.</p>
                        <select className={cx(select, "mt-2 bg-white font-medium text-emerald-800")} value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Default country code">
                          {DIAL_CODES.map((c) => (
                            <option key={c.iso} value={c.dial}>
                              {c.name} (+{c.dial})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </section>
                );
              })}
              {extra.length > 0 && (
                <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200 sm:col-span-2 lg:col-span-3">
                  <p className="text-[15px] font-semibold text-stone-900">Other columns</p>
                  <p className="text-[13px] text-stone-500">Saved with each contact, and usable in templates as variables.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {extra.map(({ m, i }) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1 text-[13.5px] text-stone-700 ring-1 ring-stone-200">
                        {headerLabel(i)} <span className="font-mono text-[12px] text-emerald-700">{`{{${m.slice(7)}}}`}</span>
                        <button type="button" className="text-stone-400 hover:text-rose-600" onClick={() => setMapping(mapping.map((x, j) => (j === i ? "skip" : x)))} aria-label={`Don't import ${headerLabel(i)}`}>
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="mx-auto max-w-5xl space-y-4 px-5 py-6 sm:px-8">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Ready to import", parsed.contacts.length, "text-stone-900"],
                  ["Opted in", optedIn, "text-emerald-700"],
                  ["Not opted in", notOptedIn, "text-amber-700"],
                  ["Can't be imported", parsed.invalid.length, "text-rose-700"],
                ].map(([l, n, c]) => (
                  <div key={l as string} className="rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200">
                    <p className={cx("text-[22px] font-semibold", c as string)}>{(n as number).toLocaleString("en-US")}</p>
                    <p className="text-[13px] text-stone-500">{l}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-stone-50 text-[12px] uppercase tracking-wider text-stone-500">
                    <tr>
                      {["Name", "Phone", "User ID", "Email", "Tags", "Opted in"].map((h) => (
                        <th key={h} className="px-4 py-2.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {parsed.contacts.slice(0, 8).map((c) => (
                      <tr key={c.phone}>
                        <td className="px-4 py-2.5 font-medium text-stone-900">{[c.firstName, c.lastName].filter(Boolean).join(" ") || <span className="text-stone-400">No name</span>}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] text-stone-700">+{c.phone}</td>
                        <td className="px-4 py-2.5 font-mono text-[13px] text-stone-600">{c.externalId ?? "—"}</td>
                        <td className="max-w-[200px] truncate px-4 py-2.5 text-stone-600">{c.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-stone-600">{c.tags.join(", ") || "—"}</td>
                        <td className="px-4 py-2.5">{c.consent === false ? <span className="text-amber-700">No</span> : <span className="text-emerald-700">Yes</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.contacts.length > 8 && <p className="border-t border-stone-100 px-4 py-2 text-[13px] text-stone-500">…and {(parsed.contacts.length - 8).toLocaleString("en-US")} more</p>}
              </div>
              {(parsed.duplicates > 0 || parsed.overLimit > 0) && (
                <p className="text-[13.5px] text-stone-600">
                  {parsed.duplicates > 0 && `${parsed.duplicates} number${parsed.duplicates === 1 ? " was" : "s were"} in the file twice: the last row is kept. `}
                  {parsed.overLimit > 0 && `${parsed.overLimit} rows are over the ${(20000).toLocaleString("en-US")} limit for one import.`}
                </p>
              )}
              {parsed.invalid.length > 0 && (
                <details className="rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900 ring-1 ring-amber-200">
                  <summary className="cursor-pointer font-medium">
                    <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden /> {parsed.invalid.length} row{parsed.invalid.length === 1 ? "" : "s"} can&apos;t be imported
                  </summary>
                  <ul className="mt-2 max-h-36 space-y-0.5 overflow-auto text-[13px]">
                    {parsed.invalid.slice(0, 100).map((x) => (
                      <li key={x.row}>
                        Row {x.row}: {x.reason} {x.value && <span className="text-amber-700">(&ldquo;{x.value}&rdquo;)</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <label className="block max-w-md">
                <span className="text-[14px] font-medium text-stone-700">Tag everyone in this file</span>
                <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={fileName.replace(/\.[^.]+$/, "").toLowerCase().slice(0, 30)} />
                <span className="mt-1 block text-[13px] text-stone-500">Optional, comma separated. Campaigns can target a tag.</span>
              </label>
              {optedIn > 0 && (
                <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-[14.5px] text-stone-800 ring-1 ring-amber-300">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    {optedIn === 1 ? "The 1 person" : `The ${optedIn.toLocaleString("en-US")} people`} {cols.consent >= 0 ? "marked as opted in" : "in this file"} agreed to get WhatsApp messages from my business.
                    <span className="block text-[13px] text-stone-500">WhatsApp requires it. Numbers that message people who didn&apos;t agree get reported and can be blocked by Meta.{notOptedIn > 0 && " The others are saved but campaigns won't message them."}</span>
                  </span>
                </label>
              )}
              {error && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === "done" && result && (
            <div className="mx-auto max-w-lg px-5 py-16 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
              <p className="mt-3 text-[20px] font-semibold text-stone-900">
                {result.added.toLocaleString("en-US")} added, {result.updated.toLocaleString("en-US")} updated
              </p>
              <p className="mt-2 text-[14.5px] text-stone-600">
                {result.noConsent ? `${result.noConsent} saved as not opted in. ` : ""}
                {result.invalid ? `${result.invalid} row${result.invalid === 1 ? "" : "s"} skipped (no usable number). ` : ""}
                {result.blocked ? `${result.blocked} opted out before, so they weren't added back.` : ""}
              </p>
              <button type="button" className={cx(btn.primary, "mt-6")} onClick={onClose}>
                See contacts
              </button>
            </div>
          )}
        </div>

        {step !== "done" && (
          <footer className="border-t border-stone-200 bg-white px-5 py-4 sm:px-8">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
              {step === "map" ? (
                <p className="text-[14px] text-stone-600">
                  <strong className="text-emerald-700">{parsed.contacts.length.toLocaleString("en-US")} contacts</strong> detected · {table.headers.length} columns available
                  {problem && <span className="block text-rose-600">{problem}</span>}
                </p>
              ) : (
                <button type="button" className={btn.ghost} onClick={() => setStep("map")} disabled={pending}>
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back to mapping
                </button>
              )}
              {step === "map" ? (
                <button type="button" className={cx(btn.primary, "px-5 py-2.5")} disabled={!!problem || !parsed.contacts.length} onClick={() => setStep("preview")}>
                  <CircleCheck className="h-4 w-4" aria-hidden /> Generate preview
                </button>
              ) : (
                <button type="button" className={cx(btn.primary, "px-5 py-2.5")} disabled={pending || !parsed.contacts.length || (optedIn > 0 && !consent)} onClick={doImport}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />} Import {parsed.contacts.length.toLocaleString("en-US")} contacts
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </Portal>
  );
}
