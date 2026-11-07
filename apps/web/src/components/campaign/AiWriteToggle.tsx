"use client";

import { Sparkles } from "lucide-react";
import { cx } from "../ui";

/** "AI writes this for each person": the text box becomes the AI's guide. 1 AI credit per person. */
export function AiWriteToggle({ on, onChange, kind }: { on: boolean; onChange: (v: boolean) => void; kind: "note" | "message" }) {
  return (
    <label
      className={cx(
        "mb-2 flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
        on ? "border-violet-300 bg-violet-50" : "border-stone-200 bg-white hover:border-stone-300",
      )}
    >
      <input type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 text-[14.5px] font-medium text-stone-900">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden /> AI writes this {kind} for each person
          <span className="rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-violet-700 ring-1 ring-violet-200">1 AI credit each</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
          {on
            ? `It reads their profile and recent posts and writes a personal ${kind}. What you write below is its guide: what to say, what to ask, any link to include. If AI can't write one (or you're out of credits), your text goes out as it is.`
            : `Your ${kind} goes out the same for everyone, with their details filled in. Turn this on for a ${kind} written personally for each person.`}
        </span>
      </span>
    </label>
  );
}
