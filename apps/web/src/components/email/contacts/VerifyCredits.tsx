"use client";

import { Check, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { VERIFY_PACKS, usd } from "@invytra/shared";
import { cancelVerifyOrderAction, orderVerifyPackAction } from "@/app/email/contacts/actions";
import { btn } from "../../AccountControls";
import { Modal } from "../../Modal";
import { cx } from "../../ui";

export interface VerifyCreditsView {
  monthly: number;
  monthlyUsed: number;
  monthlyLeft: number;
  extra: number;
  left: number;
  resetsOn: string;
  trial: boolean;
  orders: { id: string; credits: number; priceCents: number; status: "PENDING" | "PAID"; when: string }[];
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
      {open && <BuyCredits orders={c.orders} onClose={() => setOpen(false)} />}
    </div>
  );
}

function BuyCredits({ orders, onClose }: { orders: VerifyCreditsView["orders"]; onClose: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [choice, setChoice] = useState(VERIFY_PACKS[0]!.id);
  const [done, setDone] = useState<{ credits: number; priceCents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = orders.filter((o) => o.status === "PENDING");

  if (done) {
    return (
      <Modal title="Order saved" onClose={onClose}>
        <div className="space-y-4 text-[15px] text-stone-600">
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              {n(done.credits)} verification credits for {usd(done.priceCents)}. Card payment is coming soon; until then our team will contact you to complete the payment, and the credits are added as soon as it's paid.
            </span>
          </p>
          <div className="flex justify-end">
            <button type="button" className={btn.primary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Buy verification credits" description="Extra credits are used after your monthly ones run out, and they never expire." onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Credit pack">
          {VERIFY_PACKS.map((p) => {
            const on = p.id === choice;
            const per1k = usd(Math.round((p.priceCents / p.credits) * 1000));
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(p.id)}
                className={cx("rounded-xl border px-4 py-3 text-left transition", on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-stone-200 hover:border-stone-300")}
              >
                <span className="block text-[17px] font-semibold text-stone-900">{n(p.credits)}</span>
                <span className="block text-[13px] text-stone-500">credits</span>
                <span className="mt-2 block text-[16px] font-medium text-stone-900">{usd(p.priceCents)}</span>
                <span className="block text-[12.5px] text-stone-500">{per1k} per 1,000</span>
              </button>
            );
          })}
        </div>
        {pending.length > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-[13.5px] text-stone-600">
            <p className="font-medium text-stone-700">Waiting for payment</p>
            <ul className="mt-1 space-y-1">
              {pending.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span>
                    {n(o.credits)} credits · {usd(o.priceCents)} · {o.when}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-[13px] font-medium text-stone-500 hover:text-rose-600"
                    onClick={() => start(async () => (await cancelVerifyOrderAction(o.id), router.refresh()))}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-[14px] text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await orderVerifyPackAction(choice);
                if (!r.ok) return setError(r.error);
                setDone(r.value);
                router.refresh();
              })
            }
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Buy {usd(VERIFY_PACKS.find((p) => p.id === choice)!.priceCents)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
