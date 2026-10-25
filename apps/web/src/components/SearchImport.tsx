"use client";

import { IMPORT_MAX_LEADS, RESULTS_PER_PAGE, SEARCH_KIND_LABEL, SEARCH_PAGES_PER_DAY, parseSearchUrl } from "@invytra/shared";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startSearchImportAction } from "@/app/app/leads/actions";
import { btn } from "./AccountControls";
import { Field, inputCls } from "./fields";
import { Modal } from "./Modal";
import { cx } from "./ui";

export interface ImportAccount {
  id: string;
  label: string;
  status: string;
  profileName: string | null;
}

const SIZES = [10, 25, 50, 100, 250, 500, 1000, IMPORT_MAX_LEADS];

/**
 * Paste a LinkedIn or Sales Navigator search link; the worker reads it page by
 * page into the list, inside the chosen account's working hours.
 */
export function SearchImport({
  target,
  name,
  accounts,
  onClose,
  onCreated,
}: {
  target: { kind: "new" } | { kind: "add"; listId: string };
  name: string;
  accounts: ImportAccount[];
  onClose: () => void;
  onCreated?: (listId: string) => void;
}) {
  const router = useRouter();
  const usable = accounts.filter((a) => a.status !== "DISCONNECTED");
  const [url, setUrl] = useState("");
  const [accountId, setAccountId] = useState(usable[0]?.id ?? "");
  const [maxLeads, setMaxLeads] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ listId: string } | null>(null);
  const [pending, start] = useTransition();

  const parsed = url.trim() ? parseSearchUrl(url) : null;
  const pages = parsed?.ok ? Math.ceil(maxLeads / RESULTS_PER_PAGE[parsed.kind]) : 0;
  const days = Math.max(1, Math.ceil(pages / SEARCH_PAGES_PER_DAY));
  const account = accounts.find((a) => a.id === accountId);

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await startSearchImportAction({ ...(target.kind === "add" ? { listId: target.listId } : { name }), url, accountId, maxLeads });
      if (!r.ok) return setError(r.error);
      setDone({ listId: r.value.listId });
      router.refresh();
    });

  if (done) {
    return (
      <Modal title="Collecting people from your search" onClose={onClose}>
        <div className="flex items-start gap-3 text-[15px] text-stone-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <p>
            <b>{account?.label}</b> reads the search one page at a time, a few minutes apart, inside its working hours. People appear in the list
            as they&apos;re found{pages > 1 ? ` — about ${pages} pages${days > 1 ? ` over ${days} days` : ""}` : ""}. Campaigns using this list pick them
            up automatically.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            className={btn.primary}
            onClick={() => {
              onClose();
              if (onCreated) onCreated(done.listId);
              else if (target.kind === "new") router.push(`/app/leads/${done.listId}`);
            }}
          >
            {onCreated ? "Use this list" : target.kind === "new" ? "Open list" : "Done"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Field label="Search link">
        <textarea
          className={cx(inputCls, "min-h-[96px] text-[14px]")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.linkedin.com/search/results/people/?keywords=founder&geoUrn=…"
          spellCheck={false}
          aria-label="Search link"
        />
      </Field>
      <p className={cx("mt-1.5 text-[14px]", parsed && !parsed.ok ? "text-rose-700" : "text-stone-500")}>
        {parsed ? (
          parsed.ok ? (
            <span className="font-medium text-brand-800">✓ {SEARCH_KIND_LABEL[parsed.kind]}</span>
          ) : (
            parsed.reason
          )
        ) : (
          <>
            On LinkedIn, search for people and set the filters you want (location, industry, title…), then copy the address from your browser and
            paste it here. Sales Navigator lead searches and lead lists work too.
          </>
        )}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Read the search as">
          <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.length === 0 && <option value="">No connected account</option>}
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.profileName ? ` (${a.profileName})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="How many people">
          <select className={inputCls} value={maxLeads} onChange={(e) => setMaxLeads(Number(e.target.value))}>
            {SIZES.map((n) => (
              <option key={n} value={n}>
                Up to {n.toLocaleString()}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {parsed?.ok && (
        <p className="mt-3 text-[14px] text-stone-500">
          {parsed.kind === "LINKEDIN_SEARCH"
            ? "LinkedIn shows 10 people per page and up to 1,000 per search. Free accounts also have a monthly search limit."
            : "Needs an account with Sales Navigator. Sales Navigator shows 25 people per page."}{" "}
          At most {SEARCH_PAGES_PER_DAY} pages a day per account
          {pages > SEARCH_PAGES_PER_DAY ? `, so this takes about ${days} days` : ""}.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button className={btn.primary} disabled={pending || !parsed?.ok || !accountId || (target.kind === "new" && !name.trim())} onClick={submit}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Start collecting
        </button>
      </div>
    </>
  );
}
