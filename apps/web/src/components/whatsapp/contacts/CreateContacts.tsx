"use client";

import { SAMPLE_WA_CSV, WA_IMPORT, parseCsv } from "@invytra/shared";
import { ChevronDown, Download, FileUp, Info, Loader2, Upload, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { btn } from "../../btn";
import { Portal } from "../../Portal";
import { cx } from "../../ui";
import { AddContactForm } from "./AddContactForm";
import { ImportMapper } from "./ImportMapper";
import { ACCEPT, MAX_FILE_MB, readContactFile } from "./read-file";

type Loaded = { fileName: string; rows: string[][]; csv: string };
const code = "rounded bg-emerald-50 px-1.5 py-px font-mono text-[13px] text-emerald-800";

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_WA_CSV], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "invytra-contacts-sample.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

/** "Create contacts": a side panel with Bulk upload (then full-screen column mapping) and Add individually. */
export function CreateContacts({ suggestedTags }: { suggestedTags: string[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"bulk" | "one">("bulk");
  const [howTo, setHowTo] = useState(true);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, loaded]);

  const take = async (f: File | undefined) => {
    if (!f) return;
    setReading(true);
    setError(null);
    const r = await readContactFile(f);
    setReading(false);
    if ("error" in r) return setError(r.error);
    if (r.rows.filter((x) => x.some((c) => c.trim())).length < 2 && !r.rows[0]?.some((c) => /\d{7}/.test(c))) return setError("That file has no contacts in it.");
    setLoaded({ fileName: f.name, rows: r.rows, csv: r.csv });
  };

  return (
    <>
      <button type="button" className={btn.primary} onClick={() => (setTab("bulk"), setError(null), setOpen(true))}>
        <UserPlus className="h-4 w-4" aria-hidden /> Add contacts
      </button>
      {open && !loaded && (
        <Portal>
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Create contacts">
            <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 right-0 flex w-full max-w-[560px] animate-fade-up flex-col bg-white shadow-2xl">
              <div className="px-6 pb-4 pt-6">
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                    <UserPlus className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="flex-1">
                    <h2 className="text-[20px] font-semibold text-stone-900">Create contacts</h2>
                    <p className="text-[14.5px] text-stone-500">Import a spreadsheet or add one contact by hand</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
                  {(
                    [
                      ["bulk", "Bulk upload", FileUp],
                      ["one", "Add individually", UserPlus],
                    ] as const
                  ).map(([id, l, Icon]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("flex items-center justify-center gap-2 rounded-lg py-2.5 text-[15px] transition", tab === id ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
                      <Icon className="h-4 w-4" aria-hidden /> {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-stone-100" />

              {tab === "one" ? (
                <AddContactForm suggested={suggestedTags} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
              ) : (
                <>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    <div className="overflow-hidden rounded-xl ring-1 ring-stone-200">
                      <button type="button" onClick={() => setHowTo(!howTo)} className="flex w-full items-center gap-2.5 bg-stone-50 px-4 py-3 text-left text-[15px] font-semibold text-stone-900" aria-expanded={howTo}>
                        <Info className="h-4 w-4 text-stone-500" aria-hidden /> <span className="flex-1">How to format your file</span>
                        <ChevronDown className={cx("h-4 w-4 text-stone-400 transition", howTo && "rotate-180")} aria-hidden />
                      </button>
                      {howTo && (
                        <ul className="list-disc space-y-2 py-3.5 pl-9 pr-4 text-[14px] leading-relaxed text-stone-700 marker:text-stone-300">
                          <li>
                            <strong>.csv or .xlsx</strong>, up to {MAX_FILE_MB} MB (about {WA_IMPORT.maxRows.toLocaleString("en-US")} contacts per file).
                          </li>
                          <li>
                            A phone column is required: headers like <span className={code}>Phone</span>, <span className={code}>Mobile</span> or <span className={code}>WhatsApp</span> are found automatically.
                          </li>
                          <li>Include the country code. Numbers without one get the default code you choose next.</li>
                          <li>
                            Optional: <span className={code}>Name</span> <span className={code}>Email</span> <span className={code}>User ID</span> <span className={code}>Tags</span> (comma-separated) <span className={code}>WhatsApp Opted</span> (yes/no) <span className={code}>Appointment Time</span>{" "}
                            <span className={code}>Location</span>. Other columns become template variables.
                          </li>
                          <li>Same phone twice in one file? The last row wins.</li>
                          <li>Existing contacts are updated in place: matched by User ID first, then phone.</li>
                        </ul>
                      )}
                    </div>

                    <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
                    <button
                      type="button"
                      onClick={() => input.current?.click()}
                      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                      onDragLeave={() => setDrag(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDrag(false);
                        void take(e.dataTransfer.files?.[0]);
                      }}
                      className={cx("flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 transition", drag ? "border-emerald-400 bg-emerald-50/60" : "border-stone-300 bg-stone-50/60 hover:border-stone-400")}
                    >
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-stone-200">{reading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Upload className="h-6 w-6" aria-hidden />}</span>
                      <span className="mt-1 text-[16.5px] font-semibold text-stone-900">Select a CSV or Excel file</span>
                      <span className="text-[14px] text-stone-500">or drag and drop it here</span>
                    </button>
                    {error && (
                      <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
                        {error}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[14px]">
                      <button type="button" className="text-stone-600 underline underline-offset-2 hover:text-stone-900" onClick={() => setLoaded({ fileName: "invytra-contacts-sample.csv", rows: parseCsv(SAMPLE_WA_CSV), csv: SAMPLE_WA_CSV })}>
                        Try with an example file
                      </button>
                      <button type="button" className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-900" onClick={downloadSample}>
                        <Download className="h-4 w-4" aria-hidden /> Download sample CSV
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-stone-100 px-6 py-4">
                    <button type="button" className={cx(btn.secondary, "w-full")} onClick={() => setOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </aside>
          </div>
        </Portal>
      )}
      {loaded && (
        <ImportMapper
          {...loaded}
          onClear={() => setLoaded(null)}
          onClose={() => {
            setLoaded(null);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
