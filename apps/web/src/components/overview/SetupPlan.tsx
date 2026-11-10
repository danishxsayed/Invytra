import type { SetupStep, SetupStepId } from "@invytra/shared";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { HideSetupPlan } from "./HideSetupPlan";
import { cx } from "../ui";

/**
 * "Your setup plan" on the workspace overview: the steps for what this person told us after
 * sign-up, ticked off from real data. Gone once everything is done (or they hide it).
 */
export function SetupPlan({ steps, intro, hrefs }: { steps: SetupStep[]; intro: string; hrefs: Record<SetupStepId, string> }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length || done === steps.length) return null;
  const nextId = steps.find((s) => !s.done)?.id;
  return (
    <section aria-label="Your setup plan" className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start gap-3 px-5 pb-3 pt-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-stone-900 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-stone-900">Your setup plan</h2>
          <p className="text-[14px] text-stone-500">{intro}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-stone-500">
            {done} of {steps.length} done
          </span>
          <HideSetupPlan />
        </div>
      </div>
      <div className="mx-5 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>
      <ol className="mt-2 divide-y divide-stone-100">
        {steps.map((s) => {
          const isNext = s.id === nextId;
          return (
            <li key={s.id}>
              <a
                href={hrefs[s.id]}
                aria-disabled={s.done}
                className={cx("group flex items-center gap-3.5 px-5 py-3.5 transition", s.done ? "pointer-events-none" : "hover:bg-stone-50", isNext && "bg-stone-50/70")}
              >
                <span
                  className={cx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                    s.done ? "border-emerald-500 bg-emerald-500 text-white" : isNext ? "border-stone-900" : "border-stone-300",
                  )}
                >
                  {s.done && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-[15px] font-medium", s.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-900")}>{s.title}</span>
                  {!s.done && <span className="block text-[13px] leading-snug text-stone-500">{s.why}</span>}
                </span>
                {!s.done && (
                  <span className={cx("inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold", isNext ? "text-stone-900" : "text-stone-400 group-hover:text-stone-700")}>
                    {isNext ? "Start" : ""} <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
