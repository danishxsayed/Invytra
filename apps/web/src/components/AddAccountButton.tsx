"use client";

import { ArrowLeft, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Portal } from "./Portal";
import { addAccountAction, startUnipileConnectAction, verifyLinkedinEmailAction } from "@/app/app/accounts/actions";
import { btn } from "./AccountControls";
import { ConnectWindow } from "./ConnectWindow";
import { UnipileWindow } from "./UnipileWindow";
import { Field, Toggle, TimeZoneSelect, inputCls } from "./fields";

/** "Add account": 1. verify the LinkedIn login email, 2. name, time zone… → the LinkedIn login. */
export function AddAccountButton({ zones, proxyRequired, unipile = false }: { zones: string[]; proxyRequired: boolean; unipile?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  /** The email that passed the check (step 2 is shown once it's set). */
  const [verified, setVerified] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [proxyUrl, setProxyUrl] = useState("");
  const [warmup, setWarmup] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connect, setConnect] = useState<{ id: string; label: string } | null>(null);
  const [secure, setSecure] = useState<{ id: string; url: string; label: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) setTimezone(tz);
    if (params.get("add") === "1") setOpen(true);
  }, [params]);

  const close = () => {
    setOpen(false);
    setVerified(null);
    setError(null);
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await verifyLinkedinEmailAction(email);
      if (!r.ok) return setError(r.error);
      setVerified(r.value);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      // Checked again here: someone else may have added it in the meantime.
      const r = await addAccountAction({ label, timezone, proxyUrl, warmup, email: verified });
      if (!r.ok) return setError(r.error);
      // Next: the LinkedIn login. Through Unipile when it's set up, otherwise Invytra's own window.
      const how = await startUnipileConnectAction(r.value, "unipile");
      close();
      if (!how.ok) {
        // The account exists; its page has the Connect button and shows what went wrong.
        router.push(`/app/accounts/${r.value}`);
        return;
      }
      if (how.value && "url" in how.value) setSecure({ id: r.value, url: how.value.url, label: label.trim() });
      else if (how.value && "connected" in how.value) router.push(`/app/accounts/${r.value}?connected=1`);
      else setConnect({ id: r.value, label: label.trim() });
      setLabel("");
      setEmail("");
      setVerified(null);
      setProxyUrl("");
      router.replace("/app/accounts");
      router.refresh();
    });
  };

  return (
    <>
      <button className={btn.primary} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Add account
      </button>
      {open && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add a LinkedIn account">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={close} />
          <form onSubmit={verified ? submit : verify} className="relative w-full max-w-[520px] animate-fade-up rounded-2xl bg-white p-6 shadow-pop">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">Step {verified ? 2 : 1} of 2</p>
                <h2 className="text-[19px] font-semibold text-stone-900">{verified ? "Account details" : "Add a LinkedIn account"}</h2>
                <p className="mt-1 text-[15px] text-stone-500">
                  {verified ? "Then you'll log in to LinkedIn in a secure window." : "First, verify the LinkedIn account's login email."}
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!verified ? (
              <div className="mt-5 space-y-4">
                <Field label="LinkedIn login email" hint="The email you log in to LinkedIn with. We check it isn't already on Invytra.">
                  <input
                    type="email"
                    className={inputCls}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={254}
                    autoFocus
                    required
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[15px] text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{verified}</span> is verified
                  </span>
                </p>
                <Field label="Name" hint="Only you see this, e.g. “Tahur – sales”.">
                  <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoFocus required />
                </Field>
                <Field label="Time zone" hint="Actions run during working hours in this time zone.">
                  <TimeZoneSelect zones={zones} value={timezone} onChange={setTimezone} />
                </Field>
                {/* With Unipile, accounts get their IP when they connect: no proxy to enter. */}
                {!unipile && (
                  <Field
                    label={proxyRequired ? "Proxy" : "Proxy (optional on this computer)"}
                    hint={
                      proxyRequired
                        ? "Each account needs its own proxy, ideally in the account's country: http://user:password@host:port"
                        : "Development mode: without a proxy, LinkedIn sees this computer's internet connection."
                    }
                  >
                    <input
                      className={inputCls}
                      value={proxyUrl}
                      onChange={(e) => setProxyUrl(e.target.value)}
                      placeholder="http://user:password@host:port"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                )}
                <Toggle
                  checked={warmup}
                  onChange={setWarmup}
                  label="Warm up over 14 days"
                  hint="Recommended for new or rarely used accounts: daily limits start at about a third and grow."
                />
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              {verified ? (
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => {
                    setVerified(null);
                    setError(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Back
                </button>
              ) : (
                <button type="button" className={btn.secondary} onClick={close}>
                  Cancel
                </button>
              )}
              <button className={btn.primary} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{" "}
                {verified ? (pending ? "Opening LinkedIn login…" : "Continue to LinkedIn login") : pending ? "Verifying this email…" : "Verify email"}
              </button>
            </div>
          </form>
        </div>
        </Portal>
      )}
      {secure && <UnipileWindow accountId={secure.id} url={secure.url} label={secure.label} onClose={() => setSecure(null)} />}
      {connect && <ConnectWindow accountId={connect.id} label={connect.label} onClose={() => setConnect(null)} />}
    </>
  );
}
