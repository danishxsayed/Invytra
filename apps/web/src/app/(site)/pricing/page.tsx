import { BYO_PROXY_DISCOUNT, PRICE_TIERS, TRIAL, YEARLY_MONTHS_PAID, formatMoney } from "@invytra/shared";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/site/Faq";
import { PriceCalculator } from "@/components/site/PriceCalculator";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `From $${SITE.price.usd} per LinkedIn account a month, down to $${SITE.price.lowestUsd} as you add more. Every feature in every package, and a ${TRIAL.days}-day free trial.`,
};

const INCLUDED = [
  "Unlimited campaigns and lead lists",
  "Profile visits, invites with notes, messages and follow-ups",
  "Waits for acceptance and stops on reply",
  "Daily limits, warm-up and office hours, set per account",
  "A managed proxy for every account",
  "Inbox with “Needs reply”, and a full activity log with screenshots",
  "Runs in the cloud: no extension, nothing to keep open",
  "Unlimited teammates",
];

const yearly = (v: number, round: (n: number) => number) => round((v * YEARLY_MONTHS_PAID) / 12);
const usd = (n: number) => Math.round(n * 100) / 100;

const FAQ = [
  {
    q: "What's a sender?",
    a: "A LinkedIn account connected to Invytra. You pay per sender; teammates who log in to Invytra are free.",
  },
  {
    q: "How is my package chosen?",
    a: "By how many senders you have. The package's rate applies to all of them: 5 senders are 5 × $24. Add or remove senders whenever you like and the price follows.",
  },
  {
    q: "How does the free trial work?",
    a: `${TRIAL.days} days with every feature and up to ${TRIAL.maxSenders} senders, no card needed. If you don't choose a package by the end, campaigns pause and nothing is charged.`,
  },
  { q: "Can I cancel any time?", a: "Yes. Monthly packages can be cancelled whenever you like; your campaigns stop at the end of the month you've paid for." },
  {
    q: "How do yearly packages work?",
    a: `You pay for ${YEARLY_MONTHS_PAID} months and get 12. Senders added during the year are charged for the months that are left.`,
  },
  {
    q: "Which currencies can I pay in?",
    a: "US dollars by card, and Indian rupees through Razorpay (UPI, cards, net banking). GST is added to rupee prices.",
  },
  {
    q: "Can I use my own proxies?",
    a: `On the Agency and Scale packages, yes, and you save ${formatMoney(BYO_PROXY_DISCOUNT.USD, "USD")} per sender a month. Otherwise every sender gets a managed proxy.`,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-16">
      <div className="max-w-[680px]">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[58px]">
          Pay per sender. Add more, pay less for each.
        </h1>
        <p className="mt-5 text-[19px] leading-relaxed text-stone-600">
          Every package has every feature. The only difference is how many LinkedIn accounts you connect, and the price per account drops as you
          grow.
        </p>
      </div>

      <div className="mt-12">
        <PriceCalculator />
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-stone-900/10 bg-white">
        <table className="w-full min-w-[680px] text-left text-[16px]">
          <caption className="sr-only">Price per sender for each package</caption>
          <thead>
            <tr className="border-b border-stone-900/10 text-[14px] text-stone-500">
              <th className="px-5 py-3.5 font-medium">Package</th>
              <th className="px-5 py-3.5 font-medium">Senders</th>
              <th className="px-5 py-3.5 font-medium">Per sender, monthly</th>
              <th className="px-5 py-3.5 font-medium">Per sender, paid yearly</th>
              <th className="px-5 py-3.5 font-medium">In India (+ GST)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-900/[0.07]">
            {PRICE_TIERS.map((t) => (
              <tr key={t.id}>
                <th scope="row" className="px-5 py-3.5 font-display text-[18px] font-semibold text-stone-900">
                  {t.name}
                </th>
                <td className="px-5 py-3.5 tabular-nums text-stone-700">
                  {t.maxSenders === null ? `${t.minSenders}+` : t.minSenders === t.maxSenders ? "1" : `${t.minSenders}–${t.maxSenders}`}
                </td>
                <td className="px-5 py-3.5 font-semibold tabular-nums text-stone-900">{formatMoney(t.perSender.USD, "USD")}</td>
                <td className="px-5 py-3.5 tabular-nums text-stone-700">{formatMoney(yearly(t.perSender.USD, usd), "USD")}</td>
                <td className="px-5 py-3.5 tabular-nums text-stone-700">{formatMoney(t.perSender.INR, "INR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[14px] text-stone-500">More than 100 senders? Prices are by quote, write to {SITE.email}.</p>

      <section className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[30px] font-bold tracking-[-0.02em] text-stone-900">In every package</h2>
          <ul className="mt-6 grid gap-3.5">
            {INCLUDED.map((i) => (
              <li key={i} className="flex items-start gap-3 text-[17px] text-stone-800">
                <Check className="mt-1 h-5 w-5 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
                {i}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-[30px] font-bold tracking-[-0.02em] text-stone-900">Also on Agency and Scale</h2>
          <ul className="mt-6 grid gap-3.5 text-[17px] text-stone-800">
            <li className="flex items-start gap-3">
              <Check className="mt-1 h-5 w-5 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
              Use your own proxies, {formatMoney(BYO_PROXY_DISCOUNT.USD, "USD")} less per sender
            </li>
            <li className="flex items-start gap-3">
              <Check className="mt-1 h-5 w-5 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
              Priority support on WhatsApp and email
            </li>
            <li className="flex items-start gap-3 text-stone-500">
              <span className="mt-0.5 shrink-0 rounded-md bg-stone-200/70 px-1.5 text-[13px] font-medium text-stone-600">Soon</span>
              A separate workspace for each client
            </li>
            <li className="flex items-start gap-3 text-stone-500">
              <span className="mt-0.5 shrink-0 rounded-md bg-stone-200/70 px-1.5 text-[13px] font-medium text-stone-600">Soon</span>
              White-label: your brand instead of Invytra's
            </li>
          </ul>
          <p className="mt-8 rounded-2xl bg-white px-5 py-4 text-[16px] leading-relaxed text-stone-700">
            Free trial: {TRIAL.days} days, up to {TRIAL.maxSenders} senders, no card.{" "}
            <Link href="/compare" className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
              See how this compares
            </Link>{" "}
            with Expandi, HeyReach and others.
          </p>
        </div>
      </section>

      <section className="mt-20 max-w-[860px]">
        <h2 className="font-display text-[34px] font-bold tracking-[-0.02em] text-stone-900">Billing questions</h2>
        <Faq items={FAQ} />
      </section>
    </div>
  );
}
