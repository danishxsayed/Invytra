"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AI_PACKS, VERIFY_PACKS, usd } from "@invytra/shared";
import { cancelCreditOrderAction, confirmCheckoutAction, startCheckoutAction } from "@/app/workspace/billing/actions";
import { payWithRazorpay } from "./razorpay-checkout";
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

/** Choosing and paying for an extra credit pack (verification or AI) with Razorpay. Without Razorpay set up, the order waits for our team. */
export function BuyCredits({ kind, orders, onClose }: { kind: "VERIFY" | "AI"; orders: CreditOrder[]; onClose: () => void }) {
  const packs = kind === "AI" ? AI_PACKS : VERIFY_PACKS;
  const what = kind === "AI" ? "AI" : "verification";
  const router = useRouter();
  const [busy, start] = useTransition();
  const [choice, setChoice] = useState(packs[0]!.id);
  const [done, setDone] = useState<{ credits: number; priceCents: number; paid: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = orders.filter((o) => o.status === "PENDING");

  if (done) {
    return (
      <Modal title={done.paid ? "Payment received" : "Order saved"} onClose={onClose}>
        <div className="space-y-4 text-[15px] text-stone-600">
          <p className="flex items-start gap-2">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>
              {done.paid
                ? `${n(done.credits)} ${what} credits are in your workspace. The invoice is on the Billing page.`
                : `${n(done.credits)} ${what} credits for ${usd(done.priceCents)}. Our team will contact you to complete the payment, and the credits are added as soon as it's paid.`}
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
                const r = await startCheckoutAction(choice);
                if (!r.ok) return setError(r.error);
                const c = r.value;
                if (c.kind === "manual") {
                  setDone({ credits: c.credits, priceCents: c.priceCents, paid: false });
                  return router.refresh();
                }
                try {
                  const paid = await payWithRazorpay(c);
                  if (!paid) {
                    // Closed without paying: the order stays open (it can be paid or cancelled later).
                    router.refresh();
                    return setError("Payment not finished. Your order is saved below; you can pay again or cancel it.");
                  }
                  const ok = await confirmCheckoutAction({ purchaseId: c.purchaseId, orderId: paid.razorpay_order_id, paymentId: paid.razorpay_payment_id, signature: paid.razorpay_signature });
                  if (!ok.ok) return setError(ok.error);
                  setDone({ credits: ok.value.credits, priceCents: 0, paid: true });
                  router.refresh();
                } catch (e) {
                  router.refresh();
                  setError(e instanceof Error && e.message !== "blocked" ? e.message : "The payment window couldn't open. Check your connection or ad blocker and try again.");
                }
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
