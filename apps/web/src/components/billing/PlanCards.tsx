"use client";

import {
  PLANS,
  PLAN_CHANNELS,
  choiceToParams,
  SENDER_ADDON_CENTS,
  SENDER_LABEL,
  TRIAL,
  YEARLY_DISCOUNT,
  formatMoney,
  quotePlan,
  type BillingCycle,
  type PaidPlanId,
  type PlanChannel,
  type PlanChoice,
} from "@invytra/shared";
import { Check, Crown, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { choosePlanAction, confirmPlanAction } from "@/app/workspace/billing/actions";
import { payWithRazorpay, subscribeWithRazorpay } from "../credits/razorpay-checkout";
import { cx } from "../ui";

const CHANNEL_NAME: Record<PlanChannel, string> = { linkedin: "LinkedIn", email: "Email", whatsapp: "WhatsApp" };

export interface CurrentPlan {
  plan: string;
  cycle: BillingCycle | null;
  channels: PlanChannel[];
  extra: Partial<Record<PlanChannel, number>>;
  /** Trial, expired or cancelled: choosing a plan starts a new subscription. */
  canSubscribe: boolean;
  /** The trial or plan has run out. */
  ended?: boolean;
}

type Props =
  /** checkoutHref: the Billing page (after sign-up, a paid card's choice is paid there). */
  | { mode: "site"; signupHref: string; checkoutHref: string; contactHref: string; whatsappLive: boolean }
  /** autoStart: a plan chosen on the pricing page before sign-up; its checkout opens once. */
  | { mode: "app"; contactHref: string; whatsappLive: boolean; current: CurrentPlan; autoStart?: PlanChoice };

const yearlyOf = (monthlyCents: number) => Math.round(monthlyCents * 12 * (1 - YEARLY_DISCOUNT));

/**
 * The plans side by side: monthly or yearly, channels to pick (Starter), extra senders per
 * channel with − / +, and the total that follows. Signs up (website) or subscribes / changes
 * the plan (billing page).
 */
export function PlanCards(p: Props) {
  const [cycle, setCycle] = useState<BillingCycle>(p.mode === "app" ? (p.autoStart?.cycle ?? p.current.cycle ?? "monthly") : "monthly");
  const cur = p.mode === "app" ? p.current : null;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full bg-stone-200/70 p-1">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={cx("rounded-full px-4 py-1.5 text-[15px] font-semibold transition", cycle === c ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900")}
            >
              {c === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[13px] font-semibold text-emerald-800">Save 15% yearly</span>
      </div>

      <div className={cx("mt-8 grid gap-4 sm:grid-cols-2", p.mode === "site" ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        {p.mode === "site" && <TrialCard site={p.signupHref} />}
        <PaidCard plan="starter" cycle={cycle} props={p} />
        <PaidCard plan="growth" cycle={cycle} props={p} />
        <VipCard contactHref={p.contactHref} current={cur?.plan === "vip"} />
      </div>
    </div>
  );
}

function Feature({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <li className={cx("flex items-start gap-2.5 text-[15px]", muted ? "text-stone-500" : "text-stone-800")}>
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function CardShell({ children, highlight, label }: { children: React.ReactNode; highlight?: boolean; label: string }) {
  return (
    <section aria-label={label} className={cx("relative flex flex-col rounded-2xl border bg-white p-5", highlight ? "border-stone-900 shadow-[0_8px_30px_rgba(28,25,23,0.10)] ring-1 ring-stone-900" : "border-stone-900/10")}>
      {children}
    </section>
  );
}

function TrialCard({ site }: { site: string }) {
  return (
    <CardShell label="Free trial">
      <h3 className="font-display text-[22px] font-bold text-stone-900">Free trial</h3>
      <p className="mt-1 text-[14px] text-stone-500">Try Invytra on one channel.</p>
      <p className="mt-4 font-display text-[36px] font-bold leading-none text-stone-900">$0</p>
      <p className="mt-1 text-[14px] text-stone-500">for {TRIAL.days} days, no card</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        <Feature>{TRIAL.credits} credits</Feature>
        <Feature>1 channel of your choice</Feature>
        <Feature>1 sender account</Feature>
        <Feature>Every feature of that channel</Feature>
        <Feature muted>After {TRIAL.days} days, sending stops until you upgrade. Nothing is deleted.</Feature>
      </ul>
      <a href={site} className="mt-6 inline-flex justify-center rounded-xl border border-stone-900 px-4 py-2.5 text-[15px] font-semibold text-stone-900 hover:bg-stone-50">
        Start free trial
      </a>
    </CardShell>
  );
}

function VipCard({ contactHref, current }: { contactHref: string; current: boolean }) {
  return (
    <CardShell label="Custom VIP plan">
      <div className="flex items-center gap-2">
        <h3 className="font-display text-[22px] font-bold text-stone-900">Custom</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-violet-800">
          <Crown className="h-3 w-3" aria-hidden /> VIP
        </span>
      </div>
      <p className="mt-1 text-[14px] text-stone-500">For agencies and larger teams.</p>
      <p className="mt-4 font-display text-[30px] font-bold leading-none text-stone-900">Custom pricing</p>
      <p className="mt-1 text-[14px] text-stone-500">made for your volume</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        <Feature>Custom credits each month</Feature>
        <Feature>The channels you need</Feature>
        <Feature>Higher sender account limits</Feature>
        <Feature>Your business requirements</Feature>
        <Feature>Dedicated support</Feature>
      </ul>
      {current ? (
        <p className="mt-6 rounded-xl bg-stone-100 px-4 py-2.5 text-center text-[15px] font-semibold text-stone-600">Your current plan</p>
      ) : (
        <a href={contactHref} className="mt-6 inline-flex justify-center rounded-xl border border-stone-900 px-4 py-2.5 text-[15px] font-semibold text-stone-900 hover:bg-stone-50">
          Contact sales
        </a>
      )}
    </CardShell>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-stone-200 text-stone-700 hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <output aria-live="polite" className="w-8 text-center text-[16px] font-semibold tabular-nums text-stone-900">
        {value}
      </output>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function PaidCard({ plan, cycle, props: p }: { plan: PaidPlanId; cycle: BillingCycle; props: Props }) {
  const router = useRouter();
  const def = PLANS[plan];
  const cur = p.mode === "app" ? p.current : null;
  const auto = p.mode === "app" && p.autoStart?.plan === plan ? p.autoStart : null;
  const onThis = cur?.plan === plan && !cur.canSubscribe;
  const startChannels = (): PlanChannel[] => {
    if (plan === "growth") return [...PLAN_CHANNELS];
    if (auto) return [...auto.channels];
    const mine = (cur?.channels ?? []).filter((c) => PLAN_CHANNELS.includes(c));
    const pick = [...mine];
    for (const c of ["linkedin", "email", "whatsapp"] as const) if (pick.length < 2 && !pick.includes(c)) pick.push(c);
    return pick.slice(0, 2);
  };
  const [channels, setChannels] = useState<PlanChannel[]>(startChannels);
  const [extra, setExtra] = useState<Partial<Record<PlanChannel, number>>>(() => (auto ? { ...auto.extra } : cur?.plan === plan ? { ...cur.extra } : {}));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const choice: PlanChoice = { plan, cycle, channels, extra: Object.fromEntries(Object.entries(extra).filter(([c, n]) => channels.includes(c as PlanChannel) && n)) };
  const q = quotePlan(choice);
  const ready = channels.length === def.channels;
  const same = onThis && cur!.cycle === cycle && JSON.stringify([...cur!.channels].sort()) === JSON.stringify([...channels].sort()) && PLAN_CHANNELS.every((c) => (cur!.extra[c] ?? 0) === (choice.extra[c] ?? 0));

  const toggle = (c: PlanChannel) =>
    setChannels((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : xs.length >= 2 ? [xs[1]!, c] : [...xs, c]).sort((a, b) => PLAN_CHANNELS.indexOf(a) - PLAN_CHANNELS.indexOf(b)));

  const act = () =>
    start(async () => {
      setMsg(null);
      if (p.mode !== "app") return;
      const r = await choosePlanAction(choice);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const v = r.value;
      try {
        if (v.kind === "applied" || v.kind === "scheduled") {
          setMsg({ ok: true, text: v.message });
          return router.refresh();
        }
        const paid =
          v.kind === "subscription"
            ? await subscribeWithRazorpay({ keyId: v.keyId, subscriptionId: v.subscriptionId, description: v.description, prefill: v.prefill }).then((x) => x && { paymentId: x.razorpay_payment_id, signature: x.razorpay_signature, subscriptionId: x.razorpay_subscription_id })
            : await payWithRazorpay({ keyId: v.keyId, orderId: v.orderId, amount: v.amount, currency: v.currency, description: v.description, prefill: v.prefill }).then((x) => x && { paymentId: x.razorpay_payment_id, signature: x.razorpay_signature, orderId: x.razorpay_order_id });
        if (!paid) return setMsg({ ok: false, text: "Payment cancelled. Nothing was charged." });
        const c = await confirmPlanAction({ checkoutId: v.checkoutId, ...paid });
        setMsg(c.ok ? { ok: true, text: c.value.message } : { ok: false, text: c.error });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "The payment didn't go through." });
      }
    });

  // Chosen on the pricing page before signing up: open its checkout once, then tidy the address.
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", window.location.pathname + "#plans");
    act();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const button =
    p.mode === "site" ? (
      <a
        href={ready ? `${p.signupHref}?next=${encodeURIComponent(`${p.checkoutHref}?${choiceToParams(choice)}&pay=1`)}` : undefined}
        aria-disabled={!ready}
        className={cx("mt-6 inline-flex justify-center rounded-xl px-4 py-2.5 text-[15px] font-semibold", !ready && "pointer-events-none opacity-50", def.recommended ? "bg-stone-900 text-white hover:bg-stone-800" : "border border-stone-900 text-stone-900 hover:bg-stone-50")}
      >
        Choose {def.name}
      </a>
    ) : (
      <button
        type="button"
        onClick={act}
        disabled={pending || !ready || same}
        className={cx(
          "mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold disabled:cursor-not-allowed",
          same ? "bg-stone-100 text-stone-600" : def.recommended ? "bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-60" : "border border-stone-900 text-stone-900 hover:bg-stone-50 disabled:opacity-60",
        )}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {same ? "Your current plan" : cur?.canSubscribe ? (cur.plan === "trial" ? "Upgrade" : "Subscribe") : onThis ? "Update plan" : `Switch to ${def.name}`}
      </button>
    );

  return (
    <CardShell label={`${def.name} plan`} highlight={def.recommended}>
      {def.recommended && (
        <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-stone-900 px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide text-white">
          <Sparkles className="h-3 w-3 text-brand-400" aria-hidden /> Recommended
        </span>
      )}
      <h3 className="font-display text-[22px] font-bold text-stone-900">{def.name}</h3>
      <p className="mt-1 text-[14px] text-stone-500">{plan === "starter" ? "Two channels of your choice." : "Every channel, one plan."}</p>

      <div className="mt-4">
        {cycle === "yearly" ? (
          <>
            <p className="text-[15px] text-stone-400 line-through decoration-stone-400" aria-label={`Was ${formatMoney(q.listCents)} a year`}>
              {formatMoney(q.listCents)}/year
            </p>
            <p className="font-display text-[34px] font-bold leading-none text-stone-900">
              {formatMoney(q.periodCents)}
              <span className="text-[16px] font-medium text-stone-500">/year</span>
            </p>
            <p className="mt-1 text-[13px] font-semibold text-emerald-700">Save 15% · {formatMoney(q.savedCents)} off</p>
          </>
        ) : (
          <p className="font-display text-[36px] font-bold leading-none text-stone-900">
            {formatMoney(q.periodCents)}
            <span className="text-[16px] font-medium text-stone-500">/month</span>
          </p>
        )}
      </div>

      <ul className="mt-5 space-y-2.5">
        <Feature>{def.credits} credits a month</Feature>
        <Feature>{plan === "starter" ? "Any 2 channels" : "All 3 channels"}</Feature>
        <Feature>1 sender account per channel included</Feature>
      </ul>

      <fieldset className="mt-5">
        <legend className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">{plan === "starter" ? "Choose 2 channels" : "Channels"}</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLAN_CHANNELS.map((c) => {
            const on = channels.includes(c);
            const soon = c === "whatsapp" && !p.whatsappLive;
            return plan === "starter" ? (
              <button
                key={c}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(c)}
                className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] font-medium transition", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 text-stone-700 hover:border-stone-400")}
              >
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                {CHANNEL_NAME[c]}
                {soon && <span className={cx("text-[11px] font-semibold", on ? "text-brand-300" : "text-sky-700")}>soon</span>}
              </button>
            ) : (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-stone-900 bg-stone-900 px-3 py-1 text-[14px] font-medium text-white">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> {CHANNEL_NAME[c]}
                {soon && <span className="text-[11px] font-semibold text-brand-300">soon</span>}
              </span>
            );
          })}
        </div>
        {plan === "starter" && !ready && <p className="mt-1.5 text-[13px] text-amber-700">Pick {2 - channels.length} more.</p>}
      </fieldset>

      <div className="mt-5 space-y-3 border-t border-stone-100 pt-4">
        {channels.map((c) => {
          const price = SENDER_ADDON_CENTS[c];
          const total = 1 + (extra[c] ?? 0);
          return (
            <div key={c}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium text-stone-800">{SENDER_LABEL[c].many.charAt(0).toUpperCase() + SENDER_LABEL[c].many.slice(1)}</span>
                {price === null ? (
                  <span className="text-[13px] text-stone-500">1 included</span>
                ) : (
                  <Stepper label={SENDER_LABEL[c].many} value={total} min={1} max={51} onChange={(v) => setExtra((x) => ({ ...x, [c]: Math.max(0, v - 1) }))} />
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] text-stone-500">
                {price === null
                  ? `More ${SENDER_LABEL[c].many} coming with the channel.`
                  : `Additional ${SENDER_LABEL[c].one} — ${formatMoney(price)}/month per ${c === "email" ? "mailbox" : "account"}${cycle === "yearly" ? ` (${formatMoney(yearlyOf(price))}/year)` : ""}.`}
              </p>
            </div>
          );
        })}
      </div>

      {q.lines.length > 1 && (
        <dl className="mt-4 space-y-1 rounded-xl bg-stone-50 px-3.5 py-3 text-[13.5px]">
          {q.lines.map((l) => (
            <div key={l.label} className="flex justify-between gap-3 text-stone-600">
              <dt>{l.label}</dt>
              <dd className="tabular-nums">{formatMoney(l.cents)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-stone-200 pt-1 font-semibold text-stone-900">
            <dt>Total</dt>
            <dd className="tabular-nums">
              {formatMoney(q.periodCents)}/{cycle === "yearly" ? "year" : "month"}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex-1" />
      {button}
      {p.mode === "site" && <p className="mt-2 text-center text-[13px] text-stone-500">Pay by card after creating your account</p>}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={cx("mt-3 rounded-lg px-3 py-2 text-[13.5px]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
          {msg.text}
        </p>
      )}
    </CardShell>
  );
}

/** The plans compared feature by feature. */
export function PlanCompare() {
  const rows: [string, string, string, string, string][] = [
    ["Price", "$0 for 7 days", `${formatMoney(PLANS.starter.monthlyCents!)}/month`, `${formatMoney(PLANS.growth.monthlyCents!)}/month`, "Custom"],
    ["Credits each month", String(TRIAL.credits), String(PLANS.starter.credits), String(PLANS.growth.credits), "Custom"],
    ["Channels", "1 of your choice", "2 of your choice", "All 3", "Custom"],
    ["Sender accounts included", "1", "1 per channel", "1 per channel", "Custom limits"],
    ["Extra LinkedIn senders", "—", `${formatMoney(SENDER_ADDON_CENTS.linkedin!)}/month each`, `${formatMoney(SENDER_ADDON_CENTS.linkedin!)}/month each`, "Custom"],
    ["Extra email mailboxes", "—", `${formatMoney(SENDER_ADDON_CENTS.email!)}/month each`, `${formatMoney(SENDER_ADDON_CENTS.email!)}/month each`, "Custom"],
    ["Yearly billing", "—", "15% off", "15% off", "Custom"],
    ["Support", "Email", "Email", "Priority email", "Dedicated"],
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-900/10 bg-white">
      <table className="w-full min-w-[720px] text-left text-[15px]">
        <caption className="sr-only">What each plan includes</caption>
        <thead>
          <tr className="border-b border-stone-900/10 text-[14px] text-stone-500">
            <th className="px-5 py-3.5 font-medium">
              <span className="sr-only">Feature</span>
            </th>
            <th className="px-5 py-3.5 font-medium">Free trial</th>
            <th className="px-5 py-3.5 font-medium">Starter</th>
            <th className="px-5 py-3.5 font-semibold text-stone-900">Growth</th>
            <th className="px-5 py-3.5 font-medium">Custom VIP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-900/[0.07]">
          {rows.map(([name, ...cells]) => (
            <tr key={name}>
              <th scope="row" className="px-5 py-3 font-medium text-stone-900">
                {name}
              </th>
              {cells.map((c, i) => (
                <td key={i} className={cx("px-5 py-3 tabular-nums", i === 2 ? "font-medium text-stone-900" : "text-stone-700")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
