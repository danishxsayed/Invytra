"use client";

import { Check, GitBranch, PenLine } from "lucide-react";
import { cx } from "../ui";

/** Choose how to build the sequence. Advanced (branching) sequences are coming later. */
export function SequenceTypeStep({ value, onChoose }: { value: "scratch" | null; onChoose: (t: "scratch") => void }) {
  const chosen = value === "scratch";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <button
        type="button"
        onClick={() => onChoose("scratch")}
        aria-pressed={chosen}
        className={cx(
          "group relative flex flex-col rounded-2xl border bg-white p-6 text-left transition",
          chosen ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-300 hover:shadow-sm",
        )}
      >
        {chosen && (
          <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          </span>
        )}
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
          <PenLine className="h-5 w-5" aria-hidden />
        </span>
        <span className="mt-4 text-[18px] font-semibold text-stone-900">From scratch</span>
        <span className="mt-1 text-[15px] text-stone-500">
          Build the sequence step by step: profile visits, likes, invites and messages, with your own wording and waits. Start from a
          ready-made template if you like.
        </span>
      </button>

      <div aria-disabled className="relative flex cursor-not-allowed flex-col overflow-hidden rounded-2xl border border-stone-200 bg-stone-50/70 p-6">
        <span className="absolute right-4 top-4 rounded-full bg-sky-100 px-2.5 py-0.5 text-[13px] font-semibold text-sky-800">Coming soon</span>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-200/70 text-stone-500">
          <GitBranch className="h-5 w-5" aria-hidden />
        </span>
        <span className="mt-4 text-[18px] font-semibold text-stone-500">Advanced sequence from scratch</span>
        <span className="mt-1 text-[15px] text-stone-400">
          Add branches that run based on a condition, for example “if they accept the invite, send a message; if not, like their latest
          post”.
        </span>
      </div>
    </div>
  );
}
