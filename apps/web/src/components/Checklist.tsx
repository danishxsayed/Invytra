import { Check, Circle, Sparkles } from "lucide-react";
import { Card, cx } from "./ui";

export interface Step {
  label: string;
  done: boolean;
  hint: string;
  soon?: boolean;
}

/** Getting-started steps. Hidden entirely once everything is done. */
export function Checklist({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="relative px-5 py-4">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-300/40 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-800">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-stone-900">Get set up</h2>
              <p className="text-[15px] text-stone-500">
                {done} of {steps.length} done
              </p>
            </div>
          </div>
          <div className="flex w-40 gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span key={i} className={cx("h-1.5 flex-1 rounded-full", s.done ? "bg-brand-400" : "bg-stone-200")} />
            ))}
          </div>
        </div>
        <ol className="relative mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.label}
              className={cx(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                s.done ? "border-transparent bg-stone-50" : "border-stone-200 bg-white",
              )}
            >
              {s.done ? (
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-400 text-stone-900">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" aria-hidden />
              )}
              <div className="min-w-0">
                <p className={cx("text-[15px] font-medium", s.done ? "text-stone-400 line-through" : "text-stone-900")}>{s.label}</p>
                <p className="hidden text-[14px] text-stone-500 sm:block">{s.soon ? "Coming soon" : s.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
