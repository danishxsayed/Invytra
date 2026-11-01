"use client";

import { CONTACT_IMPORT, FIELD_LABEL, SAMPLE_CONTACTS_CSV, applyMapping, detectMapping, mappingProblem, readCsv, varKey, type ColumnTarget, type CsvTable } from "@invytra/shared";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { importContactsAction, requestVerificationAction } from "@/app/email/contacts/actions";
import type { ContactImportResult } from "@/lib/email-contacts";
import { btn } from "../../AccountControls";
import { Field, inputCls } from "../../fields";
import { Modal } from "../../Modal";
import { cx } from "../../ui";

export function downloadSampleCsv() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CONTACTS_CSV], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "invytra-contacts-sample.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

const FIELDS = ["skip", "email", "first_name", "last_name", "full_name", "company_name", "job_title", "website"] as const;

/**
 * Import contacts: choose a CSV → check what each column is (detected, changeable, or a
 * custom variable) → preview with errors → import into a new or existing list.
 * `after` runs with the result (e.g. to add the list to a campaign).
 */
export function ImportContactsButton({
  lists,
  variables,
  label = "Import contacts",
  primary = true,
  after,
}: {
  lists: { id: string; name: string }[];
  variables: { key: string; label: string }[];
  label?: string;
  primary?: boolean;
  after?: (r: ContactImportResult) => Promise<string | null> | string | null;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [listChoice, setListChoice] = useState<string>("new");
  const [listName, setListName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [afterNote, setAfterNote] = useState<string | null>(null);
  const [verify, setVerify] = useState(true);

  const reset = () => {
    setText("");
    setTable(null);
    setMapping([]);
    setResult(null);
    setAfterNote(null);
    setError(null);
  };
  const choose = (f: File) => {
    if (f.size > CONTACT_IMPORT.maxBytes) return setError("That file is too big (max 5 MB).");
    void f.text().then((t) => {
      const tb = readCsv(t);
      if (!tb.rows.length) return setError("That file has no rows.");
      setError(null);
      setText(t);
      setTable(tb);
      setMapping(detectMapping(tb));
      setFileName(f.name);
      setListName(f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Imported contacts");
    });
  };
  const preview = useMemo(() => (table ? applyMapping(table, mapping) : null), [table, mapping]);
  const problem = table ? mappingProblem(mapping) : null;

  const run = () =>
    start(async () => {
      setError(null);
      const r = await importContactsAction({ text, mapping, list: listChoice === "new" ? { name: listName } : { id: listChoice } });
      if (!r.ok) return setError(r.error);
      setResult(r.value);
      const notes: string[] = [];
      if (verify) {
        const v = await requestVerificationAction({ listId: r.value.listId });
        if (v.ok && v.value) notes.push(`${v.value} contact${v.value === 1 ? " is" : "s are"} being verified in the background.`);
      }
      if (after) notes.push((await after(r.value)) ?? "");
      setAfterNote(notes.filter(Boolean).join(" ") || null);
      router.refresh();
    });

  const options = (i: number): { value: ColumnTarget; label: string }[] => {
    const own = table ? varKey(table.headers[i] ?? "") : "";
    const custom = [...new Set([own, ...variables.map((v) => v.key)].filter(Boolean))];
    return [...FIELDS.map((f) => ({ value: f as ColumnTarget, label: FIELD_LABEL[f] })), ...custom.map((k) => ({ value: `custom:${k}` as ColumnTarget, label: `Custom variable {{${k}}}` }))];
  };

  return (
    <>
      <button className={primary ? btn.primary : btn.secondary} onClick={() => (reset(), setOpen(true))}>
        <Upload className="h-4 w-4" aria-hidden /> {label}
      </button>
      {open && (
        <Modal title="Import contacts" description="From a CSV file. Each column becomes a contact field or a custom variable you can use in emails." onClose={() => !pending && setOpen(false)} busy={pending} wide>
          {result ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  Imported into “{result.listName}”: {result.added} new, {result.updated} updated.
                  {result.invalidCount ? ` ${result.invalidCount} row${result.invalidCount === 1 ? "" : "s"} skipped (no valid email).` : ""}
                  {result.duplicates ? ` ${result.duplicates} repeated in the file.` : ""}
                  {result.suppressed ? ` ${result.suppressed} are on your suppression list and won't be emailed.` : ""}
                  {result.variables.length ? ` Variables: ${result.variables.map((v) => `{{${v}}}`).join(", ")}.` : ""}
                </span>
              </p>
              {afterNote && <p className="rounded-xl bg-stone-50 px-4 py-3 text-[15px] text-stone-800">{afterNote}</p>}
              <div className="flex justify-end">
                <button className={btn.primary} onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          ) : !table ? (
            <div className="space-y-4">
              <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => (e.target.files?.[0] && choose(e.target.files[0]), (e.target.value = ""))} />
              <button
                type="button"
                onClick={() => file.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-6 py-10 text-stone-600 transition hover:border-stone-400 hover:bg-stone-50"
              >
                <FileUp className="h-8 w-8 text-stone-400" aria-hidden />
                <span className="text-[16px] font-medium text-stone-800">Choose a CSV file</span>
                <span className="text-[14px]">Needs an email column. Up to {CONTACT_IMPORT.maxRows.toLocaleString()} rows, 5 MB.</span>
              </button>
              <button type="button" className={btn.ghost} onClick={downloadSampleCsv}>
                <Download className="h-4 w-4" aria-hidden /> Download a sample CSV
              </button>
              {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[15px] font-semibold text-stone-900">
                  1. What's in each column <span className="font-normal text-stone-500">({fileName}, {table.rows.length} rows)</span>
                </p>
                <div className="max-h-[260px] overflow-auto rounded-xl ring-1 ring-stone-200">
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
                          <td className="max-w-[220px] truncate px-3 py-1.5 text-stone-500">{table.rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "—"}</td>
                          <td className="px-3 py-1.5">
                            <select className={cx(inputCls, "mt-0 py-1.5 text-[14px]")} value={mapping[i]} onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? (e.target.value as ColumnTarget) : m)))}>
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

              {preview && !problem && (
                <div>
                  <p className="mb-2 text-[15px] font-semibold text-stone-900">2. Preview</p>
                  <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
                    <table className="w-full text-left text-[13.5px]">
                      <thead className="bg-stone-50 text-[12.5px] text-stone-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                          {preview.customKeys.slice(0, 3).map((k) => (
                            <th key={k} className="px-3 py-2 font-mono font-medium">{`{{${k}}}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {preview.contacts.slice(0, 5).map((c) => (
                          <tr key={c.email}>
                            <td className="px-3 py-1.5">{c.email}</td>
                            <td className="px-3 py-1.5">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</td>
                            <td className="px-3 py-1.5">{c.company ?? "—"}</td>
                            {preview.customKeys.slice(0, 3).map((k) => (
                              <td key={k} className="max-w-[160px] truncate px-3 py-1.5">{c.vars[k] ?? "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[14px] text-stone-700">
                    <strong>{preview.contacts.length}</strong> contact{preview.contacts.length === 1 ? "" : "s"} ready
                    {preview.duplicates.length > 0 && <> · {preview.duplicates.length} repeated in the file (kept once)</>}
                    {preview.overLimit > 0 && <> · {preview.overLimit} over the limit</>}
                  </p>
                  {preview.invalid.length > 0 && (
                    <details className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900">
                      <summary className="cursor-pointer">
                        <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden /> {preview.invalid.length} row{preview.invalid.length === 1 ? "" : "s"} can't be imported
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-auto text-[13px]">
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

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="3. Add to list">
                  <select className={inputCls} value={listChoice} onChange={(e) => setListChoice(e.target.value)}>
                    <option value="new">A new list…</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {listChoice === "new" && (
                  <Field label="List name">
                    <input className={inputCls} value={listName} onChange={(e) => setListName(e.target.value)} maxLength={80} />
                  </Field>
                )}
              </div>
              <label className="flex items-start gap-2 text-[14px] text-stone-700">
                <input type="checkbox" className="mt-1 accent-lime-500" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
                <span>Verify these contacts after importing (in the background; campaigns skip addresses that fail)</span>
              </label>
              {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
              <div className="flex justify-between gap-2">
                <button type="button" className={btn.ghost} onClick={reset} disabled={pending}>
                  Choose another file
                </button>
                <button className={btn.primary} onClick={run} disabled={pending || !!problem || !preview?.contacts.length || (listChoice === "new" && !listName.trim())}>
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
