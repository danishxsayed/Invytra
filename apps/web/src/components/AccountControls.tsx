"use client";

import { Loader2, Pause, Play, Plug, RefreshCw, Router, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { pauseAction, removeAccountAction, resumeAfterCheckAction, startUnipileConnectAction } from "@/app/app/accounts/actions";
import { ConnectWindow } from "./ConnectWindow";
import { Portal } from "./Portal";
import { UnipileWindow } from "./UnipileWindow";
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Unipile's login page when it's set up for this account; otherwise Invytra's own login window.
  const [choosing, setChoosing] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const connect = (how?: "unipile" | "browser") =>
    start(async () => {
      setError(null);
      setChoosing(false);
      const r = await startUnipileConnectAction(id, how);
      if (!r.ok) setError(r.error);
      else if (r.value && "url" in r.value) setLoginUrl(r.value.url);
      else if (r.value) setChoosing(true);
      else setConnecting(true);
    });
  useEffect(() => {
    if (ask === id && (next === "connect" || next === "reconnect")) connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, id, next]);

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
          <button className={btn.primary} disabled={pending} onClick={() => connect()}>
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
      {choosing && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`how-${id}`}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h2 id={`how-${id}`} className="text-[18px] font-semibold text-stone-900">
                  How should {label} connect?
                </h2>
                <button type="button" onClick={() => setChoosing(false)} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-1 text-[14px] text-stone-500">This account has its own proxy saved.</p>
              <div className="mt-4 grid gap-2.5">
                <button type="button" disabled={pending} onClick={() => connect("unipile")} className="rounded-xl border border-stone-900 p-3.5 text-left ring-1 ring-stone-900 transition hover:bg-stone-50">
                  <span className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
                    <ShieldCheck className="h-4 w-4" aria-hidden /> Secure login with a dedicated IP
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[12px] font-semibold text-brand-900">Recommended</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-stone-500">Log in on Unipile's page. The account gets its own IP; your proxy isn't used.</span>
                </button>
                <button type="button" disabled={pending} onClick={() => connect("browser")} className="rounded-xl border border-stone-200 p-3.5 text-left transition hover:border-stone-300 hover:bg-stone-50">
                  <span className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
                    <Router className="h-4 w-4" aria-hidden /> Use my own proxy
                  </span>
                  <span className="mt-0.5 block text-[13px] text-stone-500">Log in inside Invytra's window, through the proxy saved on this account.</span>
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
      {loginUrl && <UnipileWindow url={loginUrl} label={label} onClose={() => setLoginUrl(null)} />}
      {connecting && <ConnectWindow accountId={id} label={label} onClose={() => setConnecting(false)} />}
    </div>
  );
}
