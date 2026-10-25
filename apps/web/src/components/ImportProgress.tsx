"use client";

import { SEARCH_KIND_LABEL, type SearchKind } from "@invytra/shared";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { cancelSearchImportAction } from "@/app/app/leads/actions";
import { btn } from "./AccountControls";
import { Card, cx } from "./ui";

export interface ImportView {
  id: string;
  kind: string;
  url: string;
  status: string;
  maxLeads: number;
  pages: number;
  found: number;
  added: number;
  reasonText: string | null;
  accountLabel: string;
  accountActive: boolean;
  /** What a running import is waiting for, if anything. */
  waiting: string | null;
  when: string;
}

/** Searches being collected into this list (and the last few finished ones). Refreshes itself while one runs. */
export function ImportProgress({ listId, imports }: { listId: string; imports: ImportView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const running = imports.some((i) => i.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(t);
  }, [running, router]);
  if (imports.length === 0) return null;

  return (
    <Card className="divide-y divide-stone-100">
      {imports.map((i) => {
        const pct = Math.min(100, Math.round((i.found / i.maxLeads) * 100));
        const live = i.status === "RUNNING";
        return (
          <div key={i.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                live ? "bg-violet-50 text-violet-600" : i.status === "DONE" ? "bg-emerald-50 text-emerald-600" : "bg-stone-100 text-stone-500",
              )}
            >
              {live ? <Search className="h-4 w-4" aria-hidden /> : i.status === "DONE" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-stone-900">
                {live ? "Collecting from a " : "From a "}
                <a href={i.url} target="_blank" rel="noreferrer noopener" className="underline decoration-stone-300 underline-offset-2 hover:decoration-stone-600">
                  {SEARCH_KIND_LABEL[i.kind as SearchKind] ?? "search"}
                </a>
                <span className="font-normal text-stone-500"> · via {i.accountLabel} · {i.when}</span>
              </p>
              <p className="text-[14px] text-stone-500">
                {i.added.toLocaleString()} added
                {i.found > i.added ? ` (${(i.found - i.added).toLocaleString()} were already in the list)` : ""} · {i.pages} {i.pages === 1 ? "page" : "pages"} read
                {live && i.waiting && <span className="text-amber-700"> · {i.waiting}</span>}
                {!live && i.reasonText && <span> · {i.reasonText}</span>}
              </p>
              {live && (
                <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${Math.max(3, pct)}%` }} />
                </div>
              )}
            </div>
            {live && (
              <button className={btn.secondary} disabled={pending} onClick={() => start(async () => void (await cancelSearchImportAction(i.id, listId), router.refresh()))}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Stop
              </button>
            )}
          </div>
        );
      })}
    </Card>
  );
}
