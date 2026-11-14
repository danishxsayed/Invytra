"use client";

import { SAMPLE_WA_CSV, WA_FIELD_LABEL, WA_IMPORT, applyPhoneMapping, detectPhoneMapping, phoneMappingProblem, readPhoneCsv, varKey, type WaColumnTarget, type WaCsvTable } from "@invytra/shared";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { importWaContactsAction } from "@/app/whatsapp/contacts/actions";
import type { WaImportResult } from "@/lib/whatsapp-contacts";
import { btn } from "../../btn";
import { Field, inputCls } from "../../fields";
import { Modal } from "../../Modal";
import { cx } from "../../ui";

const FIELDS = ["skip", "phone", "first_name", "last_name", "full_name", "email", "company_name", "tags"] as const;

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_WA_CSV], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "invytra-whatsapp-contacts-sample.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

/** Import contacts from a CSV: columns → fields, a default country code, extra tags, consent. */
export function ImportWaContacts() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<WaCsvTable | null>(null);
  const [mapping, setMapping] = useState<WaColumnTarget[]>([]);
  const [cc, setCc] = useState("");
  const [tags, setTags] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WaImportResult | null>(null);

  const reset = () => (setText(""), setTable(null), setMapping([]), setResult(null), setError(null), setConsent(false), setTags(""));
  const choose = (f: File) => {
    if (f.size > WA_IMPORT.maxBytes) return setError("That file is too big (max 5 MB).");
    void f.text().then((t) => {
      const tb = readPhoneCsv(t);
      if (!tb.rows.length) return setError("That file has no rows.");
      setError(null);
      setText(t);
      setTable(tb);
      setMapping(detectPhoneMapping(tb));
      setFileName(f.name);
    });
  };
  const preview = useMemo(() => (table ? applyPhoneMapping(table, mapping, cc) : null), [table, mapping, cc]);
  const problem = table ? phoneMappingProblem(mapping) : null;
  const options = (i: number) => {
    const own = table ? varKey(table.headers[i] ?? "") : "";
    return [...FIELDS.map((f) => ({ value: f as WaColumnTarget, label: WA_FIELD_LABEL[f] })), ...(own ? [{ value: `custom:${own}` as WaColumnTarget, label: `Custom variable {{${own}}}` }] : [])];
  };

  return (
    <>
      <button type="button" className={btn.primary} onClick={() => (reset(), setOpen(true))}>
        <Upload className="h-4 w-4" aria-hidden /> Import contacts
      </button>
      {open && (
        <Modal title="Import WhatsApp contacts" description="From a CSV file with a phone number column. Other columns become fields, tags or variables for your templates." onClose={() => !pending && setOpen(false)} busy={pending} wide>
          {result ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  {result.added} new, {result.updated} updated.
                  {result.invalid ? ` ${result.invalid} row${result.invalid === 1 ? "" : "s"} skipped (no usable number).` : ""}
                  {result.duplicates ? ` ${result.duplicates} repeated in the file.` : ""}
                  {result.blocked ? ` ${result.blocked} opted out before, so they weren't added back.` : ""}
                </span>
              </p>
              <div className="flex justify-end">
                <button type="button" className={btn.primary} onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : !table ? (
            <div className="space-y-4">
              <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => (e.target.files?.[0] && choose(e.target.files[0]), (e.target.value = ""))} />
              <button type="button" onClick={() => file.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-6 py-10 text-stone-600 transition hover:border-stone-400 hover:bg-stone-50">
                <FileUp className="h-8 w-8 text-stone-400" aria-hidden />
                <span className="text-[16px] font-medium text-stone-800">Choose a CSV file</span>
                <span className="text-[14px]">Needs a phone number column. Up to {WA_IMPORT.maxRows.toLocaleString("en-US")} rows, 5 MB.</span>
              </button>
              <button type="button" className={btn.ghost} onClick={downloadSample}>
                <Download className="h-4 w-4" aria-hidden /> Download a sample CSV
              </button>
              {error && (
                <p role="alert" className="text-[14px] text-rose-700">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[15px] font-semibold text-stone-900">
                  1. What&apos;s in each column{" "}
                  <span className="font-normal text-stone-500">
                    ({fileName}, {table.rows.length} rows)
                  </span>
                </p>
                <div className="max-h-[240px] overflow-auto rounded-xl ring-1 ring-stone-200">
                  <table className="w-full text-left text-[14px]">
                    <thead className="sticky top-0 bg-stone-50 text-[12.5px] text-stone-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Column</th>
                        <th className="px-3 py-2 font-medium">Example</th>
                        <th className="px-3 py-2 font-medium">Import as</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {table.headers.map((h, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-medium text-stone-800">{h}</td>
                          <td className="max-w-[200px] truncate px-3 py-1.5 text-stone-500">{table.rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "—"}</td>
                          <td className="px-3 py-1.5">
                            <select className={cx(inputCls, "mt-0 py-1.5 text-[14px]")} value={mapping[i]} onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? (e.target.value as WaColumnTarget) : m)))}>
                              {options(i).map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {problem && <p className="mt-2 text-[14px] text-rose-700">{problem}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="2. Default country code" hint="For numbers written without one, like 050 123 4567.">
                  <div className="mt-1 flex items-center rounded-lg border border-stone-200 bg-white focus-within:border-brand-600">
                    <span className="pl-3 text-stone-500">+</span>
                    <input className="w-full rounded-lg px-1.5 py-2 text-[15px] outline-none" value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="971" inputMode="numeric" />
                  </div>
                </Field>
                <Field label="3. Tag everyone in this file" hint="Optional, comma separated. Campaigns can target a tag.">
                  <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={fileName.replace(/\.[^.]+$/, "").toLowerCase().slice(0, 30)} />
                </Field>
              </div>

              {preview && !problem && (
                <div className="rounded-xl bg-stone-50 px-4 py-3 text-[14px] text-stone-700 ring-1 ring-stone-200">
                  <strong>{preview.contacts.length}</strong> contact{preview.contacts.length === 1 ? "" : "s"} ready
                  {preview.duplicates > 0 && <> · {preview.duplicates} repeated (kept once)</>}
                  {preview.overLimit > 0 && <> · {preview.overLimit} over the limit</>}
                  {preview.contacts[0] && (
                    <span className="block text-[13px] text-stone-500">
                      First: +{preview.contacts[0].phone} {[preview.contacts[0].firstName, preview.contacts[0].lastName].filter(Boolean).join(" ")}
                    </span>
                  )}
                  {preview.invalid.length > 0 && (
                    <details className="mt-2 text-amber-900">
                      <summary className="cursor-pointer">
                        <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden /> {preview.invalid.length} row{preview.invalid.length === 1 ? "" : "s"} can&apos;t be imported
                      </summary>
                      <ul className="mt-1 max-h-28 overflow-auto text-[13px]">
                        {preview.invalid.slice(0, 50).map((x) => (
                          <li key={x.row}>
                            Row {x.row}: {x.reason} {x.value && <span className="text-amber-700">(“{x.value}”)</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <label className="flex items-start gap-2 rounded-xl bg-amber-50/70 p-3 text-[14px] text-stone-800 ring-1 ring-amber-200">
                <input type="checkbox" className="mt-1 accent-lime-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  Everyone in this file agreed to get WhatsApp messages from my business. <span className="text-stone-500">WhatsApp requires it. Numbers that message people who didn&apos;t agree get reported, lose quality and can be blocked by Meta.</span>
                </span>
              </label>
              {error && (
                <p role="alert" className="text-[14px] text-rose-700">
                  {error}
                </p>
              )}
              <div className="flex justify-between gap-2">
                <button type="button" className={btn.ghost} onClick={reset} disabled={pending}>
                  Choose another file
                </button>
                <button
                  type="button"
                  className={btn.primary}
                  disabled={pending || !!problem || !preview?.contacts.length || !consent}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await importWaContactsAction({ text, mapping, defaultCountry: cc, tags, consent: consent || undefined });
                      if (!r.ok) return setError(r.error);
                      setResult(r.value);
                      router.refresh();
                    })
                  }
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Import {preview?.contacts.length ?? 0} contacts
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
