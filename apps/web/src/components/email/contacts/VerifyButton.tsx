"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { requestVerificationAction } from "@/app/email/contacts/actions";
import type { ContactFilter } from "@/lib/email-contacts";
import { btn } from "../../AccountControls";

/** Verifies the contacts in view that aren't verified yet (or came back unknown). */
export function VerifyButton({ listId, filter, q }: { listId?: string; filter?: ContactFilter; q?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {note && <span className="text-[13px] text-stone-500">{note}</span>}
      <button
        className={btn.secondary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestVerificationAction({ listId, filter, q });
            setNote(r.ok ? (r.value ? `${r.value} queued` : "Nothing new to verify") : r.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Verify {listId ? "this list" : "contacts"}
      </button>
    </span>
  );
}

/** While contacts are being verified: how many are left; reloads every 10 seconds. */
export function VerifyProgress({ pending, problem, configured }: { pending: number; problem: string | null; configured: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [pending, router]);
  if (!pending && configured) return null;
  return (
    <div className="space-y-2">
      {pending > 0 && (
        <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] ${problem ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
          <Loader2 className={`h-4 w-4 ${problem ? "" : "animate-spin"}`} aria-hidden />
          {problem ? `Verification is paused: ${problem}. ${pending} contact${pending === 1 ? "" : "s"} waiting.` : `Verifying ${pending} contact${pending === 1 ? "" : "s"} in the background…`}
        </p>
      )}
      {!configured && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-[13.5px] text-stone-600">
          Deep verification isn't set up yet (MillionVerifier API key). Until then only free checks run: bad format, domains that can't receive mail and throwaway inboxes are marked Invalid; everything else stays Unknown.
        </p>
      )}
    </div>
  );
}
