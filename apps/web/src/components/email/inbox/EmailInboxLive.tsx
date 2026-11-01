"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { checkEmailNowAction } from "@/app/email/inbox/actions";

/** While the inbox is open: asks the worker to read the mailboxes every minute and reloads every 30 seconds. */
export function EmailInboxLive() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [at, setAt] = useState(() => new Date());
  const refresh = useCallback(() => start(() => (router.refresh(), setAt(new Date()))), [router]);
  useEffect(() => {
    void checkEmailNowAction();
    const ask = setInterval(() => document.visibilityState === "visible" && void checkEmailNowAction(), 60_000);
    const reload = setInterval(() => document.visibilityState === "visible" && refresh(), 30_000);
    return () => (clearInterval(ask), clearInterval(reload));
  }, [refresh]);
  return (
    <button onClick={() => (void checkEmailNowAction(), refresh())} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-stone-500 hover:bg-stone-100 hover:text-stone-800">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      Updated {at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </button>
  );
}
