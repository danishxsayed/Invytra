"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

/**
 * Any page that crashes in the browser shows this instead of a blank "Application error":
 * what went wrong (so it can be reported), and a way to try again.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Where it broke (file:line in the page's code), so a screenshot is enough to find the cause.
  const where = (error.stack ?? "")
    .split("\n")
    .filter((l) => /\/_next\//.test(l))
    .slice(0, 4)
    .map((l) => l.replace(/^\s*at\s+/, "").replace(/https?:\/\/[^/]+/, ""))
    .join("\n");
  const chunk = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message);
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-sm ring-1 ring-stone-200">
        <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-[20px] font-semibold text-stone-900">{chunk ? "Invytra was updated" : "Something went wrong on this page"}</h1>
        <p className="mt-1 text-[15px] text-stone-600">{chunk ? "Reload the page to get the new version." : "Try again. If it keeps happening, send a screenshot of this box to the Invytra team."}</p>
        {!chunk && (
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 px-3 py-2 text-[12.5px] text-stone-700 ring-1 ring-stone-200">
            {error.message || "Unknown error"}
            {error.digest ? `\n(ref ${error.digest})` : ""}
            {where && <span className="mt-2 block text-[11.5px] text-stone-400">{where}</span>}
          </pre>
        )}
        <div className="mt-5 flex gap-2">
          <button onClick={() => (chunk ? window.location.reload() : reset())} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-400 px-3.5 py-2 text-[15px] font-semibold text-stone-900 hover:bg-brand-300">
            <RefreshCw className="h-4 w-4" aria-hidden /> {chunk ? "Reload" : "Try again"}
          </button>
          {!chunk && (
            <button onClick={() => window.location.reload()} className="rounded-lg border border-stone-200 px-3.5 py-2 text-[15px] font-medium text-stone-700 hover:bg-stone-50">
              Reload page
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
