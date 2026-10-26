"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { requestInboxCheckAction } from "@/app/app/inbox/actions";

function ago(iso: string | null, now: number): string {
  if (!iso) return "not checked yet";
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "checked just now" : m < 60 ? `checked ${m} min ago` : `checked ${Math.round(m / 60)} h ago`;
}

/**
 * Keeps the open inbox fresh: while the tab is visible it asks the worker to look
 * at LinkedIn (at most every 3 minutes per account) and reloads the list.
 */
export function InboxLive() {
  const router = useRouter();
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const r = await requestInboxCheckAction();
      setLast(r.lastChecked);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    void check();
    const tick = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void check();
    }, 60_000);
    const refresh = setInterval(() => document.visibilityState === "visible" && router.refresh(), 20_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [check, router]);

  return (
    <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5 text-[12px] text-stone-400">
      <span>LinkedIn {ago(last, now)}</span>
      <button onClick={() => void check()} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />} Check now
      </button>
    </div>
  );
}
