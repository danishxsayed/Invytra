"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AI_PACKS, VERIFY_PACKS, usd } from "@invytra/shared";
import { cancelCreditOrderAction, orderCreditPackAction } from "@/app/workspace/credits/actions";
import { btn } from "../AccountControls";
import { Modal } from "../Modal";
import { cx } from "../ui";

export interface CreditOrder {
  id: string;
  credits: number;
  priceCents: number;
  status: "PENDING" | "PAID";
  when: string;
}

const n = (v: number) => v.toLocaleString("en-US");

/** Choosing an extra credit pack (verification or AI). Until card payment is live, an order is saved and completed by our team. */
export function BuyCredits({ kind, orders, onClose }: { kind: "VERIFY" | "AI"; orders: CreditOrder[]; onClose: () => void }) {
  const packs = kind === "AI" ? AI_PACKS : VERIFY_PACKS;
  const what = kind === "AI" ? "AI" : "verification";
  const router = useRouter();
  const [busy, start] = useTransition();
  const [choice, setChoice] = useState(packs[0]!.id);
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
              {n(done.credits)} {what} credits for {usd(done.priceCents)}. Card payment is coming soon; until then our team will contact you to complete the payment, and the credits are added as soon as it's paid.
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
    <Modal title={`Buy ${what} credits`} description="Extra credits are used after your monthly ones run out, and they never expire." onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Credit pack">
          {packs.map((p) => {
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
                    onClick={() => start(async () => (await cancelCreditOrderAction(o.id), router.refresh()))}
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
                const r = await orderCreditPackAction(choice);
                if (!r.ok) return setError(r.error);
                setDone(r.value);
                router.refresh();
              })
            }
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Buy {usd(packs.find((p) => p.id === choice)!.priceCents)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
