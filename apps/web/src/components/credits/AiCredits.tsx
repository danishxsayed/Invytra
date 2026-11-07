"use client";

import { CreditCard, Sparkles } from "lucide-react";
import { useState } from "react";
import { btn } from "../AccountControls";
import { cx } from "../ui";
import { BuyCredits, type CreditOrder } from "./BuyCredits";

export interface AiCreditsView {
  monthly: number;
  monthlyUsed: number;
  monthlyLeft: number;
  extra: number;
  left: number;
  resetsOn: string;
  trial: boolean;
  usage: { action: string; label: string; cost: number; times: number; credits: number }[];
  orders: CreditOrder[];
}

const n = (v: number) => v.toLocaleString("en-US");

/** The shared AI credits: balance, what each feature costs, what used them this month, and buying more. */
export function AiCredits({ c }: { c: AiCreditsView }) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.round((c.monthlyUsed / Math.max(1, c.monthly)) * 100));
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-brand-400">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-[19px] font-semibold text-stone-900">AI credits</h2>
            <p className="text-[14px] text-stone-500">One balance for every AI feature, on every channel.</p>
          </div>
        </div>
        <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>
          <CreditCard className="h-4 w-4" aria-hidden /> Buy more
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-wide text-stone-400">Left to use</p>
          <p className={cx("mt-1 text-[40px] font-semibold leading-none tabular", c.left === 0 ? "text-rose-600" : "text-stone-900")}>{n(c.left)}</p>
        </div>
        <div className="min-w-[240px] flex-1">
          <div className="flex justify-between text-[14px] text-stone-600">
            <span>
              This month: {n(c.monthlyLeft)} of {n(c.monthly)} left
            </span>
            <span>Resets {c.resetsOn}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100" role="meter" aria-label="Monthly AI credits used" aria-valuemin={0} aria-valuemax={c.monthly} aria-valuenow={c.monthlyUsed}>
            <div className={cx("h-full rounded-full", c.monthlyLeft === 0 ? "bg-amber-400" : "bg-gradient-to-r from-brand-400 to-brand-500")} style={{ width: `${Math.max(pct, c.monthlyUsed ? 3 : 0)}%` }} />
          </div>
          <p className="mt-1.5 text-[13px] text-stone-500">
            Extra credits: <b className="font-semibold text-stone-800">{n(c.extra)}</b> (never expire, used after this month's).{" "}
            {c.trial ? "Trial: 50 a month; paid plans get 500." : "Your plan includes 500 a month."}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-stone-200">
        <table className="w-full text-left text-[14.5px]">
          <thead className="bg-stone-50 text-[13px] text-stone-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Feature</th>
              <th className="px-4 py-2.5 text-right font-medium">Cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Used this month</th>
              <th className="px-4 py-2.5 text-right font-medium">Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {c.usage.map((u) => (
              <tr key={u.action}>
                <td className="px-4 py-2.5 text-stone-800">{u.label}</td>
                <td className="px-4 py-2.5 text-right tabular text-stone-600">
                  {u.cost} credit{u.cost === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-2.5 text-right tabular text-stone-600">{u.times ? `${n(u.times)}×` : "—"}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular text-stone-900">{u.credits ? n(u.credits) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-stone-500">Credits are only used when the AI delivers. If a draft, note or recording fails, the credits go back.</p>
      {open && <BuyCredits kind="AI" orders={c.orders} onClose={() => setOpen(false)} />}
    </section>
  );
}
