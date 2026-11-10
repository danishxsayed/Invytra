"use client";

import { INVY_EXAMPLES, INVY_MESSAGE_MAX } from "@invytra/shared";
import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startSearchAction } from "@/app/workspace/invy/actions";

/** The big "what are you looking for" box on the Ask Invy home. */
export function AskBox({ base, credits }: { base: string; credits: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const go = (t = text) =>
    start(async () => {
      setError("");
      const r = await startSearchAction(t);
      if (!r.ok) return setError(r.error);
      router.push(`${base}/${r.value.id}`);
    });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="rounded-2xl border border-stone-300 bg-white p-3 shadow-sm focus-within:border-stone-500"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) go();
            }
          }}
          rows={3}
          maxLength={INVY_MESSAGE_MAX}
          autoFocus
          placeholder="Find 20 restaurants in Bangalore that don't have a website…"
          aria-label="What should Invy find?"
          className="w-full resize-none bg-transparent px-1 text-[17px] leading-relaxed placeholder:text-stone-400 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[12px] text-stone-400">1 AI credit per business found · {credits.toLocaleString("en-US")} left</p>
          <button type="submit" disabled={!text.trim() || pending} className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-[14px] font-semibold text-white hover:bg-stone-700 disabled:opacity-40">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />} Ask Invy
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-[14px] text-rose-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {INVY_EXAMPLES.map((e) => (
          <button key={e} type="button" disabled={pending} onClick={() => setText(e)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[13px] text-stone-700 transition hover:border-stone-400">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
