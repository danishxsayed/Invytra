import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cx } from "../ui";

export interface Stat {
  label: string;
  value: string;
  /** Change vs the week before ("+12", "−3", "+2.1 pts"); null = nothing to compare. */
  change: { text: string; dir: "up" | "down" | "same" } | null;
  /** Split by channel, e.g. "LinkedIn 31 · Email 12". */
  split?: string;
}

/** This week's numbers across every channel. */
export function WeekStrip({ stats }: { stats: Stat[] }) {
  return (
    <section aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-[13px] font-medium text-stone-500">{s.label}</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tracking-tight tabular text-stone-900">{s.value}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
            {s.change ? (
              <span className={cx("inline-flex items-center gap-0.5 font-medium", s.change.dir === "up" ? "text-emerald-700" : s.change.dir === "down" ? "text-rose-700" : "text-stone-500")}>
                {s.change.dir === "up" ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : s.change.dir === "down" ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
                {s.change.text}
              </span>
            ) : (
              <span className="text-stone-400">No data last week</span>
            )}
            {s.split && <span className="text-stone-400">{s.split}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
