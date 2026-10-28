"use client";

import { Loader2, Pause, Play, Plug, RefreshCw, Settings2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { pauseAction, removeAccountAction, resumeAfterCheckAction } from "@/app/app/accounts/actions";
import { ConnectWindow } from "./ConnectWindow";
import { cx } from "./ui";

interface Props {
  id: string;
  label: string;
  status: string;
  next: "connect" | "reconnect" | "resume" | "none";
  /** NEEDS_ATTENTION with a saved login (and not a restriction): allow "it's fine, carry on". */
  canResumeAfterCheck: boolean;
  /** Show Settings / Remove (the account page) or only the main button (dashboard). */
  full?: boolean;
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-400 px-3.5 py-2 text-[15px] font-semibold text-stone-900 shadow-glow transition hover:bg-brand-300 disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[15px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-60",
};

/** Connect / reconnect / pause / resume / remove for one LinkedIn account. */
export function AccountControls({ id, label, status, next, canResumeAfterCheck, full }: Props) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  // "Connect" in the sidebar's account list opens this account's login window straight away.
  const params = useSearchParams();
  const ask = params.get("connect");
  useEffect(() => {
    if (ask === id && (next === "connect" || next === "reconnect")) setConnecting(true);
  }, [ask, id, next]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {(next === "connect" || next === "reconnect") && (
          <button className={btn.primary} onClick={() => setConnecting(true)}>
            {next === "connect" ? <Plug className="h-4 w-4" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {next === "connect" ? "Connect LinkedIn" : "Reconnect"}
          </button>
        )}
        {status === "PAUSED" && (
          <button className={btn.primary} disabled={pending} onClick={() => run(() => pauseAction(id, false))}>
            <Play className="h-4 w-4" aria-hidden /> Resume
          </button>
        )}
        {status === "NEEDS_ATTENTION" && canResumeAfterCheck && full && (
          <button className={btn.secondary} disabled={pending} onClick={() => run(() => resumeAfterCheckAction(id))} title="Only if you've checked LinkedIn yourself and everything looks normal">
            I've checked, resume
          </button>
        )}
        {status === "ACTIVE" && full && (
          <button className={btn.secondary} disabled={pending} onClick={() => run(() => pauseAction(id, true))}>
            <Pause className="h-4 w-4" aria-hidden /> Pause
          </button>
        )}
        {full && (
          <Link href={`/app/accounts/${id}`} className={btn.secondary}>
            <Settings2 className="h-4 w-4" aria-hidden /> Settings
          </Link>
        )}
        {full && !confirmRemove && (
          <button className={btn.ghost} onClick={() => setConfirmRemove(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-label="Working" />}
      </div>

      {confirmRemove && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-800">
          Remove {label}? Its saved login, queued actions and replies are deleted.
          <button
            className={cx(btn.secondary, "border-rose-300 py-1.5 text-rose-700 hover:bg-rose-100")}
            disabled={pending}
            onClick={() => run(() => removeAccountAction(id), () => router.push("/app/accounts"))}
          >
            Yes, remove
          </button>
          <button className={cx(btn.ghost, "py-1.5")} onClick={() => setConfirmRemove(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[15px] text-rose-700">
          {error}
        </p>
      )}
      {connecting && <ConnectWindow accountId={id} label={label} onClose={() => setConnecting(false)} />}
    </div>
  );
}
