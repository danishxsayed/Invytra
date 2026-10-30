"use client";

import { Loader2, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pollUnipileLoginAction } from "@/app/app/accounts/actions";
import { Portal } from "./Portal";

const POLL_MS = 3000;

/**
 * The secure LinkedIn login, shown inside Invytra (no new tab, no address bar).
 * It checks every few seconds whether the login finished, then goes to the account page.
 */
export function UnipileWindow({ accountId, url, label, onClose }: { accountId: string; url: string; label: string; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Watch for the login to finish (Unipile can't always send this window back by itself).
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (stop) return;
      const r = await pollUnipileLoginAction(accountId).catch(() => null);
      if (stop) return;
      if (r?.ok && r.value === "done") {
        close.current();
        router.push(`/app/accounts/${accountId}?connected=1`);
        router.refresh();
        return;
      }
      if (r?.ok && r.value === "duplicate") {
        setProblem("That LinkedIn profile is already connected as another account here. Close this and use a different LinkedIn account.");
        return;
      }
      timer = setTimeout(check, POLL_MS);
    };
    timer = setTimeout(check, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [accountId, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Connect ${label}`}>
        <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm" />
        <div className="relative flex h-full max-h-[760px] w-full max-w-[560px] animate-fade-up flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
          <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold text-stone-900">Connect {label}</h2>
              <p className="text-[14px] text-stone-500">Log in to LinkedIn, including any verification code.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-white">
            <iframe
              src={url}
              title="LinkedIn login"
              onLoad={() => setLoaded(true)}
              className="h-full w-full border-0"
              allow="clipboard-write; publickey-credentials-get *"
              referrerPolicy="no-referrer"
            />
            {problem && (
              <div className="absolute inset-0 flex items-center justify-center bg-white p-8">
                <p role="alert" className="max-w-sm text-center text-[15px] font-medium text-rose-700">
                  {problem}
                </p>
              </div>
            )}
            {!loaded && !problem && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400" aria-hidden />
                <p className="text-[15px] text-stone-500" role="status">
                  Opening a secure login…
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 text-[14px] text-stone-500">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Invytra never sees or stores your password. This window closes by itself once you're in.
          </div>
        </div>
      </div>
    </Portal>
  );
}
