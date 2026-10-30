"use client";

import { AtSign, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveLinkedinEmailAction } from "@/app/app/accounts/actions";
import { btn } from "./AccountControls";

/**
 * For accounts added before Invytra asked for it: the LinkedIn login email, so the same
 * LinkedIn can't be added again here or by another user.
 */
export function LinkedinEmailPrompt({ id }: { id: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await saveLinkedinEmailAction(id, email);
          if (!r.ok) setError(r.error);
          else router.refresh();
        });
      }}
    >
      <label htmlFor={`le-${id}`} className="flex items-center gap-1.5 text-[15px] font-semibold text-amber-900">
        <AtSign className="h-4 w-4" aria-hidden /> Add this account&apos;s LinkedIn login email
      </label>
      <p className="text-[14px] text-amber-800">So the same LinkedIn account can&apos;t be added again, here or by anyone else.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id={`le-${id}`}
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[15px] text-stone-900 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200"
        />
        <button className={btn.primary} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {pending ? "Verifying this email…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-medium text-rose-700">
          {error}
        </p>
      )}
    </form>
  );
}
