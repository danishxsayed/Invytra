"use client";

import { leadsFromCsv, leadsFromText, LEAD_IMPORT, type ColumnMapping, type LeadParseResult } from "@invytra/shared";
import { ClipboardPaste, FileUp, Loader2, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { importLeadsAction } from "@/app/app/leads/actions";
import type { ImportSummary } from "@/lib/leads";
import { btn } from "./AccountControls";
import { Field, inputCls } from "./fields";
import { ImportPreview, MappingEditor } from "./ImportPreview";
import { Modal } from "./Modal";
import { SearchImport, type ImportAccount } from "./SearchImport";
import { cx } from "./ui";

type Target = { kind: "new" } | { kind: "add"; listId: string; listName: string };

/** Create a list (or add to one) from a CSV file or pasted LinkedIn links. */
export function ImportLeads({
  target,
  onClose,
  accounts = [],
  initialTab,
  onCreated,
}: {
  target: Target;
  onClose: () => void;
  /** LinkedIn accounts that can read a search link. */
  accounts?: ImportAccount[];
  initialTab?: "csv" | "paste" | "search";
  /** Called with the new list's id instead of opening it (used by the campaign builder). */
  onCreated?: (listId: string) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"csv" | "paste" | "search">(initialTab ?? (accounts.length ? "search" : "csv"));
  const [name, setName] = useState("");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [pasted, setPasted] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const result: LeadParseResult | null = useMemo(() => {
    if (tab === "search") return null;
    if (tab === "csv") return file ? leadsFromCsv(file.text, mapping) : null;
    return pasted.trim() ? leadsFromText(pasted) : null;
  }, [tab, file, pasted, mapping]);

  const readFile = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > LEAD_IMPORT.maxBytes) return setError("That file is too large (5 MB max). Split it into smaller files.");
    if (/\.(xlsx?|numbers)$/i.test(f.name)) return setError("Save the spreadsheet as CSV first (File → Download / Export → CSV).");
    void f.text().then((text) => {
      setMapping(undefined);
      setFile({ name: f.name, text });
      if (!name && target.kind === "new") setName(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    });
  };

  const count = result?.leads.length ?? 0;
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await importLeadsAction({
        ...(target.kind === "add" ? { listId: target.listId } : { name }),
        kind: tab === "csv" ? "csv" : "paste",
        text: tab === "csv" ? (file?.text ?? "") : pasted,
        ...(tab === "csv" && result ? { mapping: result.mapping } : {}),
      });
      if (!r.ok) return setError(r.error);
      setDone(r.value);
      router.refresh();
    });

  if (done) {
    return (
      <Modal title={done.added ? "Leads added" : "Nothing new to add"} onClose={onClose}>
        <ul className="space-y-2 text-[15px] text-stone-700">
          <Line ok>
            <b>{done.added.toLocaleString()}</b> {done.added === 1 ? "lead" : "leads"} added
          </Line>
          {done.alreadyInList > 0 && <Line>{done.alreadyInList.toLocaleString()} were already in this list</Line>}
          {done.inOtherLists > 0 && (
            <Line warn>
              {done.inOtherLists.toLocaleString()} of them are also in another of your lists — campaigns won't contact the same person twice.
            </Line>
          )}
          {done.invalid > 0 && <Line>{done.invalid.toLocaleString()} rows had no usable LinkedIn profile link</Line>}
        </ul>
        <div className="mt-6 flex justify-end">
          <button
            className={btn.primary}
            onClick={() => {
              onClose();
              if (onCreated && target.kind === "new") onCreated(done.listId);
              else if (target.kind === "new") router.push(`/app/leads/${done.listId}`);
            }}
          >
            {target.kind === "new" ? "Open list" : "Done"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      busy={pending}
      onClose={onClose}
      title={target.kind === "new" ? "New lead list" : `Add leads to ${target.listName}`}
      description="Collect people from a LinkedIn or Sales Navigator search, upload a CSV (Sales Navigator, Apollo, Excel…), or paste profile links."
    >
      {target.kind === "new" && (
        <Field label="List name" className="mb-4">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Pune founders – Oct" />
        </Field>
      )}

      <div role="tablist" className="mb-4 inline-flex rounded-lg bg-stone-100 p-1">
        {(
          [
            ["search", "From a search", Search],
            ["csv", "Upload CSV", FileUp],
            ["paste", "Paste links", ClipboardPaste],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[15px] font-medium transition",
              tab === k ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "search" ? (
        <SearchImport
          target={target.kind === "add" ? { kind: "add", listId: target.listId } : { kind: "new" }}
          name={name}
          accounts={accounts}
          onClose={onClose}
          onCreated={onCreated}
        />
      ) : tab === "csv" ? (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readFile(e.dataTransfer.files[0]);
            }}
            className={cx(
              "flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-7 text-center transition",
              dragging ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-stone-50/60 hover:border-stone-300",
            )}
          >
            <Upload className="h-6 w-6 text-stone-400" aria-hidden />
            <span className="text-[15px] font-medium text-stone-800">{file ? file.name : "Drop a CSV file here, or click to choose"}</span>
            <span className="text-[14px] text-stone-500">
              {file ? "Click to choose a different file" : `Needs a column with LinkedIn profile links · up to ${LEAD_IMPORT.maxLeads.toLocaleString()} leads`}
            </span>
          </button>
          <input ref={input} type="file" accept=".csv,.txt,.tsv,text/csv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          {result && result.headers.length > 0 && (
            <MappingEditor headers={result.headers} sample={result.sample} mapping={result.mapping} onChange={setMapping} />
          )}
        </>
      ) : (
        <textarea
          className={cx(inputCls, "min-h-[180px] font-mono text-[14px]")}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={"https://www.linkedin.com/in/jane-doe/\nhttps://www.linkedin.com/in/john-smith-123/"}
          spellCheck={false}
          aria-label="LinkedIn profile links"
        />
      )}

      {tab !== "search" && result && <ImportPreview result={result} />}

      {tab !== "search" && error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
          {error}
        </p>
      )}

      {tab !== "search" && <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          className={btn.primary}
          disabled={pending || count === 0 || (target.kind === "new" && !name.trim())}
          onClick={submit}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {count === 0
            ? target.kind === "new"
              ? "Create list"
              : "Add leads"
            : `${target.kind === "new" ? "Create list with" : "Add"} ${count.toLocaleString()} ${count === 1 ? "lead" : "leads"}`}
        </button>
      </div>}
    </Modal>
  );
}

function Line({ children, ok, warn }: { children: React.ReactNode; ok?: boolean; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ok ? "bg-brand-500" : warn ? "bg-amber-400" : "bg-stone-300")} />
      <span>{children}</span>
    </li>
  );
}
