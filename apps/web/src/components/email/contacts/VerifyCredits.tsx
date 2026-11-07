"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { btn } from "../../AccountControls";
import { BuyCredits, type CreditOrder } from "../../credits/BuyCredits";
import { cx } from "../../ui";

export interface VerifyCreditsView {
  monthly: number;
  monthlyUsed: number;
  monthlyLeft: number;
  extra: number;
  left: number;
  resetsOn: string;
  trial: boolean;
  orders: CreditOrder[];
}

const n = (v: number) => v.toLocaleString("en-US");

/** This month's verification credits, extra credits, and buying more. */
export function VerifyCredits({ c }: { c: VerifyCreditsView }) {
  const [open, setOpen] = useState(false);
  const pct = Math.min(100, Math.round((c.monthlyUsed / Math.max(1, c.monthly)) * 100));
  const low = c.left === 0 ? "empty" : c.left < 100 ? "low" : null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border px-4 py-3", low === "empty" ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white")}>
      <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[14.5px]">
          <span className="font-medium text-stone-900">Verification credits</span>
          <span className="tabular text-stone-600">
            {n(c.monthlyLeft)} of {n(c.monthly)} left this month{c.extra > 0 && <> · <span className="font-medium text-stone-900">{n(c.extra)}</span> extra</>}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100" role="meter" aria-label="Monthly verification credits used" aria-valuemin={0} aria-valuemax={c.monthly} aria-valuenow={c.monthlyUsed}>
          <div className={cx("h-full rounded-full", c.monthlyLeft === 0 ? "bg-amber-400" : "bg-gradient-to-r from-brand-400 to-brand-500")} style={{ width: `${Math.max(pct, c.monthlyUsed > 0 ? 3 : 0)}%` }} />
        </div>
        <p className="mt-1 text-[13px] text-stone-500">
          {low === "empty"
            ? `No credits left: verification waits until you add more or ${c.resetsOn}.`
            : `1 credit per address checked; format and domain checks are free. ${c.trial ? "Trial: 100 a month (paid plans get 1,000)." : "Your plan includes 1,000 a month."} Resets ${c.resetsOn}; extra credits never expire.`}
        </p>
      </div>
      <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>
        <CreditCard className="h-4 w-4" aria-hidden /> Buy more
      </button>
      {open && <BuyCredits kind="VERIFY" orders={c.orders} onClose={() => setOpen(false)} />}
    </div>
  );
}
