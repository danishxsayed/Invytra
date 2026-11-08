import { AlertTriangle, ArrowRight, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { Attention } from "@/lib/overview";
import { cx } from "../ui";

const TONE = {
  urgent: { icon: OctagonAlert, cls: "text-rose-600 bg-rose-50" },
  warn: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-50" },
  info: { icon: Info, cls: "text-sky-600 bg-sky-50" },
} as const;

/** What needs someone's attention, most urgent first, each with where to fix it. */
export function NeedsAttention({ items }: { items: Attention[] }) {
  const order = { urgent: 0, warn: 1, info: 2 };
  const sorted = [...items].sort((a, b) => order[a.tone] - order[b.tone]);
  return (
    <section aria-labelledby="attention-h" className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <h2 id="attention-h" className="flex items-center gap-2 border-b border-stone-100 px-5 py-3.5 text-[16px] font-semibold text-stone-900">
        Needs attention
        {sorted.length > 0 && <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[12px] font-semibold text-white">{sorted.length}</span>}
      </h2>
      {sorted.length ? (
        <ul className="divide-y divide-stone-100">
          {sorted.map((a) => {
            const t = TONE[a.tone];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:flex-nowrap">
                <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", t.cls)}>
                  <t.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-stone-900">{a.title}</p>
                  <p className="truncate text-[13.5px] text-stone-500">{a.detail}</p>
                </div>
                {a.action && (
                  <a href={a.action.href} className="ml-12 inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[14px] font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 sm:ml-0">
                    {a.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-5 py-4 text-[15px] text-stone-600">
          <CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" aria-hidden /> All good: every account and mailbox is working.
        </p>
      )}
    </section>
  );
}
