"use client";

import { Check } from "lucide-react";
import { cx } from "../ui";

export interface WizardStep {
  key: string;
  label: string;
  hint: string;
}

/**
 * The campaign builder's steps: a list on the left on wide screens, a row on top on
 * small ones. A step can be opened once every step before it is complete.
 */
export function Stepper({
  steps,
  current,
  done,
  canOpen,
  onOpen,
}: {
  steps: WizardStep[];
  current: number;
  /** Steps that are complete (nothing missing) and have been passed. */
  done: boolean[];
  canOpen: (i: number) => boolean;
  onOpen: (i: number) => void;
}) {
  return (
    <nav aria-label="Campaign steps">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {steps.map((s, i) => {
          const open = canOpen(i);
          const here = i === current;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                disabled={!open}
                onClick={() => onOpen(i)}
                aria-current={here ? "step" : undefined}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  here ? "bg-white shadow-sm ring-1 ring-stone-200" : open ? "hover:bg-white/70" : "cursor-not-allowed opacity-55",
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                    done[i] && !here ? "bg-emerald-600 text-white" : here ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-500",
                  )}
                >
                  {done[i] && !here ? <Check className="h-4 w-4" strokeWidth={3} aria-label="Done" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cx("block whitespace-nowrap text-[15px]", here ? "font-semibold text-stone-900" : "font-medium text-stone-700")}>{s.label}</span>
                  <span className="hidden text-[13px] leading-snug text-stone-500 lg:block">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
