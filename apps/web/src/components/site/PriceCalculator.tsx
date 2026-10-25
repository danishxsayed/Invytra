"use client";

import { BYO_PROXY_DISCOUNT, PRICE_TIERS, formatMoney, priceFor, type Billing, type Currency } from "@invytra/shared";
import Link from "next/link";
import { useState } from "react";
import { cx } from "../ui";

const STOPS = [1, 2, 3, 5, 10, 15, 25, 35, 50, 75, 100];

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-stone-900/[0.06] p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx("rounded-lg px-3.5 py-1.5 text-[15px] font-medium transition", value === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Pick a number of senders, see the package and the price. */
export function PriceCalculator() {
  const [senders, setSenders] = useState(5);
  const [billing, setBilling] = useState<Billing>("monthly");
  const [currency, setCurrency] = useState<Currency>("USD");
  const q = priceFor(senders, { currency, billing });
  const money = (v: number) => formatMoney(v, currency);
  const gst = currency === "INR" ? " + GST" : "";
  const pos = (n: number) => `${(STOPS.indexOf(n) / (STOPS.length - 1)) * 100}%`;
  const idx = STOPS.findIndex((s) => s >= senders);

  return (
    <div className="overflow-hidden rounded-[28px] border border-stone-900/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-900/[0.07] px-6 py-4 sm:px-10">
        <Toggle label="Billing" value={billing} onChange={setBilling} options={[["monthly", "Monthly"], ["yearly", "Yearly (2 months free)"]]} />
        <Toggle label="Currency" value={currency} onChange={setCurrency} options={[["USD", "USD $"], ["INR", "INR ₹"]]} />
      </div>
      <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <label htmlFor="senders" className="flex items-baseline justify-between gap-4">
            <span className="text-[17px] font-semibold text-stone-900">How many LinkedIn accounts?</span>
            <span className="font-display text-[34px] font-bold tabular-nums text-stone-900">
              {senders}
              {senders === 100 ? "+" : ""}
            </span>
          </label>
          <input
            id="senders"
            type="range"
            min={0}
            max={STOPS.length - 1}
            step={1}
            value={idx === -1 ? STOPS.length - 1 : idx}
            onChange={(e) => setSenders(STOPS[Number(e.target.value)]!)}
            aria-valuetext={`${senders} senders`}
            style={{ "--p": pos(STOPS[idx === -1 ? STOPS.length - 1 : idx]!) } as React.CSSProperties}
            className="range mt-5 w-full"
          />
          <div className="mt-2 flex justify-between text-[13px] tabular-nums text-stone-400">
            {[1, 10, 25, 50, 100].map((n) => (
              <span key={n}>{n === 100 ? "100+" : n}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 text-[15px] text-stone-600">
            <span>Or type a number:</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={senders}
              onChange={(e) => setSenders(Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1))))}
              aria-label="Number of LinkedIn accounts"
              className="w-24 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[16px] tabular-nums text-stone-900 focus:outline-none focus:ring-4 focus:ring-brand-200"
            />
          </div>
          <ol className="mt-8 grid grid-cols-5 gap-1.5" aria-label="Packages">
            {PRICE_TIERS.map((t) => (
              <li
                key={t.id}
                className={cx("rounded-xl px-2 py-2.5 text-center transition", t.id === q.tier.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600")}
              >
                <p className="text-[14px] font-semibold">{t.name}</p>
                <p className={cx("text-[12px] tabular-nums", t.id === q.tier.id ? "text-stone-300" : "text-stone-400")}>
                  {t.maxSenders === null ? `${t.minSenders}+` : t.minSenders === t.maxSenders ? "1" : `${t.minSenders}–${t.maxSenders}`}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col justify-between gap-8 bg-brand-400 px-6 py-8 sm:px-10 sm:py-10" aria-live="polite">
          {q.quote ? (
            <div>
              <p className="text-[17px] font-semibold text-stone-900">{q.tier.name}</p>
              <p className="mt-3 font-display text-[44px] font-bold leading-none tracking-[-0.03em] text-stone-900">Let's talk</p>
              <p className="mt-4 text-[16px] leading-relaxed text-stone-800">Over 100 accounts we price each setup individually, usually below {money(q.tier.perSender[currency])} per sender.</p>
            </div>
          ) : (
            <div>
              <p className="text-[17px] font-semibold text-stone-900">{q.tier.name}</p>
              <p className="mt-3 flex items-end gap-2">
                <span className="font-display text-[64px] font-bold leading-[0.85] tracking-[-0.04em] tabular-nums text-stone-900">{money(q.perMonth)}</span>
                <span className="pb-1 text-[16px] text-stone-800">/month{gst}</span>
              </p>
              <p className="mt-3 text-[16px] text-stone-800">
                {money(q.perSender)} per sender
                {billing === "yearly" && `, ${money(q.charged)} billed yearly`}
              </p>
              {q.betterDeal && (
                <p className="mt-4 rounded-xl bg-stone-900/[0.08] px-3 py-2 text-[15px] text-stone-900">
                  Tip: {q.betterDeal.senders} senders cost {money(q.betterDeal.perMonth)} a month, less than {senders}.
                </p>
              )}
              {(q.tier.id === "agency" || q.tier.id === "scale") && (
                <p className="mt-4 text-[15px] text-stone-800">Bring your own proxies and save {money(BYO_PROXY_DISCOUNT[currency])} per sender.</p>
              )}
            </div>
          )}
          <Link
            href={q.quote ? "mailto:hello@invytra.com?subject=Invytra%20for%20100%2B%20accounts" : "/signup"}
            className="inline-flex justify-center rounded-xl bg-stone-900 px-5 py-3 text-[16px] font-semibold text-white hover:bg-stone-700"
          >
            {q.quote ? "Email us" : "Start your free trial"}
          </Link>
        </div>
      </div>
    </div>
  );
}
