"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importEmailLeadsAction } from "@/app/email/campaigns/actions";
import type { LeadImportResult } from "@/lib/email-campaigns";
import { btn } from "../../AccountControls";
import { inputCls } from "../../fields";
import { cx } from "../../ui";

/** Upload or paste a CSV of leads: an email column, plus names, company and any other columns (they become variables). */
export function LeadsImport({ id }: { id: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeadImportResult | null>(null);

  const send = (csv: string) =>
    start(async () => {
      setError(null);
      setResult(null);
      const r = await importEmailLeadsAction(id, csv);
      if (!r.ok) return setError(r.error);
      setResult(r.value);
      if (r.value.added) {
        setText("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 5_000_000) return setError("That file is too big (max 5 MB).");
            void f.text().then(send);
          }}
        />
        <button className={btn.secondary} onClick={() => file.current?.click()} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />} Upload CSV
        </button>
        <span className="text-[14px] text-stone-500">or paste below. Needs an email column; other columns (first name, company, city…) become variables.</span>
      </div>
      <textarea
        className={cx(inputCls, "min-h-[90px] font-mono text-[13px]")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"email,first name,company\npriya@acme.io,Priya,Acme"}
      />
      {text.trim() && (
        <button className={btn.primary} onClick={() => send(text)} disabled={pending}>
          Add leads
        </button>
      )}
      {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
      {result && (
        <div className={cx("rounded-lg px-3 py-2 text-[14px]", result.added ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")} aria-live="polite">
          {result.noEmailColumn ? (
            <p>Couldn't find a column with email addresses.</p>
          ) : (
            <p>
              Added {result.added} lead{result.added === 1 ? "" : "s"}
              {result.alreadyInCampaign ? ` · ${result.alreadyInCampaign} already in this campaign` : ""}
              {result.doNotContact ? ` · ${result.doNotContact} skipped (replied or bounced before)` : ""}
              {result.duplicates ? ` · ${result.duplicates} repeated in the file` : ""}
              {result.invalid.length ? ` · ${result.invalid.length}${result.invalid.length === 20 ? "+" : ""} without a valid email` : ""}
              {result.overLimit ? ` · ${result.overLimit} over the 10,000 limit` : ""}.
              {result.columns.length > 0 && <> Variables from your columns: {result.columns.map((c) => `{${c}}`).join(", ")}.</>}
            </p>
          )}
          {result.invalid.length > 0 && <p className="mt-1 text-[13px] opacity-80">For example row {result.invalid[0]!.row}: “{result.invalid[0]!.value}”</p>}
        </div>
      )}
    </div>
  );
}
