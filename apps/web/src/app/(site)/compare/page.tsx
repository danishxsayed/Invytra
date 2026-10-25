import { TRIAL, formatMoney, priceFor } from "@invytra/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { cx } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Compare",
  description: "Invytra's price next to Expandi, HeyReach, SalesRobot, Dripify and Waalaxy, and what's different about how Invytra works.",
};

/*
 * Figures as reported from each company's public pricing page in Sep–Oct 2026
 * (via third-party pricing write-ups). Re-check before changing; keep the date in SITE.compareCheckedOn.
 */
const ROWS: { tool: string; monthly: string; annual: string; trial: string; note: string; us?: boolean }[] = [
  {
    tool: "Invytra",
    monthly: `$${SITE.price.usd}`,
    annual: formatMoney(priceFor(1, { billing: "yearly" }).perSender, "USD"),
    trial: `${TRIAL.days} days`,
    note: `Every feature in every package; down to $${SITE.price.lowestUsd} per sender as you add more`,
    us: true,
  },
  { tool: "Expandi", monthly: "$99", annual: "$79", trial: "7 days", note: "Custom pricing for agencies with 10+ seats" },
  { tool: "HeyReach", monthly: "$79", annual: "$63", trial: "14 days", note: "Agency plan: $999 a month for 25 senders" },
  { tool: "SalesRobot", monthly: "$59", annual: "$39", trial: "14 days", note: "Entry plan allows 1 active campaign; unlimited campaigns from $79" },
  { tool: "Dripify", monthly: "$79", annual: "$59", trial: "7 days", note: "Team features on the $99 plan" },
  { tool: "Waalaxy", monthly: "€19", annual: "about €9.50", trial: "14 days", note: "300 invites a month on this plan; 800 from €49" },
];

const VOLUME: { tool: string; five: string; twentyFive: string; note: string; us?: boolean }[] = [
  {
    tool: "Invytra",
    five: formatMoney(priceFor(5).perMonth, "USD"),
    twentyFive: formatMoney(priceFor(25).perMonth, "USD"),
    note: "Every feature, managed proxy included",
    us: true,
  },
  { tool: "HeyReach", five: "$395", twentyFive: "$999", note: "25 senders on the Agency plan, which needs your own proxies" },
  { tool: "Dripify", five: "$395", twentyFive: "$1,975", note: "Pro plan; team features are on the $99 plan" },
  { tool: "Expandi", five: "$495", twentyFive: "By quote", note: "Agency pricing from 10 seats is by quote" },
  { tool: "Waalaxy", five: "€95", twentyFive: "€475", note: "Pro plan: 300 invites a month per account" },
];

const DIFFERENT = [
  {
    title: "Log in inside Invytra, not with a cookie or extension",
    body: "You connect LinkedIn by logging in yourself in a secure window on the Invytra page, including any verification code. There's nothing to install and no cookies to copy.",
  },
  {
    title: "A fresh inbox read before every campaign message",
    body: "If Invytra hasn't looked at the inbox since it last contacted someone, it reads it first. A reply that just arrived stops the message.",
  },
  {
    title: "Nobody is contacted twice",
    body: "Anyone any of your accounts already invited or messaged, or who is in another of your campaigns, is skipped automatically.",
  },
  {
    title: "Missing details skip the lead",
    body: "If a message uses {company} and a lead has no company in your list, that person is skipped rather than getting a broken message.",
  },
  {
    title: "A screenshot for every failure",
    body: "When an action fails, the activity log shows what LinkedIn displayed at that moment, so you can see why.",
  },
];

const OTHERS = [
  { need: "Cold email and LinkedIn in one tool", body: "Invytra is LinkedIn only. Tools such as Dripify, or Waalaxy's Business plan, include email." },
  { need: "Importing straight from a Sales Navigator search", body: "Invytra imports Sales Navigator CSV exports, but not search links yet." },
  { need: "White-label for an agency's clients", body: "Invytra has no white-label option. HeyReach and Expandi offer one on their agency plans." },
];

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-16">
      <div className="max-w-[700px]">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[58px]">How Invytra compares</h1>
        <p className="mt-5 text-[19px] leading-relaxed text-stone-600">
          Starting prices for one LinkedIn account, paid monthly, as published by each company. Every tool here does more than its price line shows,
          so check what you actually need.
        </p>
      </div>

      <div className="mt-12 overflow-x-auto rounded-2xl border border-stone-900/10 bg-white">
        <table className="w-full min-w-[760px] text-left text-[16px]">
          <thead>
            <tr className="border-b border-stone-900/10 text-[14px] text-stone-500">
              <th className="px-5 py-3.5 font-medium">Tool</th>
              <th className="px-5 py-3.5 font-medium">Per account, monthly</th>
              <th className="px-5 py-3.5 font-medium">Per month, paid yearly</th>
              <th className="px-5 py-3.5 font-medium">Free trial</th>
              <th className="px-5 py-3.5 font-medium">Worth knowing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-900/[0.07]">
            {ROWS.map((r) => (
              <tr key={r.tool} className={cx(r.us && "bg-brand-50")}>
                <th scope="row" className={cx("px-5 py-4 font-display text-[18px]", r.us ? "font-bold text-stone-900" : "font-semibold text-stone-800")}>
                  {r.tool}
                </th>
                <td className={cx("px-5 py-4 tabular-nums", r.us ? "font-bold text-stone-900" : "text-stone-800")}>{r.monthly}</td>
                <td className="px-5 py-4 tabular-nums text-stone-600">{r.annual}</td>
                <td className="px-5 py-4 text-stone-600">{r.trial}</td>
                <td className="px-5 py-4 text-[15px] text-stone-600">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-stone-500">
        Other tools' prices as listed on their pricing pages in {SITE.compareCheckedOn}. Prices and plans change, and promotions aren't shown; check
        each company's own site before deciding. All names are trademarks of their owners.
      </p>

      <section className="mt-20">
        <h2 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[40px]">With more senders</h2>
        <p className="mt-3 max-w-[640px] text-[17px] leading-relaxed text-stone-600">
          What a month costs for a small team and for an agency, on each company's published per-account price, paid monthly.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-900/10 bg-white">
          <table className="w-full min-w-[640px] text-left text-[16px]">
            <thead>
              <tr className="border-b border-stone-900/10 text-[14px] text-stone-500">
                <th className="px-5 py-3.5 font-medium">Tool</th>
                <th className="px-5 py-3.5 font-medium">5 senders</th>
                <th className="px-5 py-3.5 font-medium">25 senders</th>
                <th className="px-5 py-3.5 font-medium">Conditions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-900/[0.07]">
              {VOLUME.map((r) => (
                <tr key={r.tool} className={cx(r.us && "bg-brand-50")}>
                  <th scope="row" className={cx("px-5 py-4 font-display text-[18px]", r.us ? "font-bold text-stone-900" : "font-semibold text-stone-800")}>
                    {r.tool}
                  </th>
                  <td className={cx("px-5 py-4 tabular-nums", r.us ? "font-bold text-stone-900" : "text-stone-800")}>{r.five}</td>
                  <td className={cx("px-5 py-4 tabular-nums", r.us ? "font-bold text-stone-900" : "text-stone-800")}>{r.twentyFive}</td>
                  <td className="px-5 py-4 text-[15px] text-stone-600">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-20 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[40px]">What's different about how Invytra works</h2>
        <dl className="divide-y divide-stone-900/10 border-y border-stone-900/10">
          {DIFFERENT.map((d) => (
            <div key={d.title} className="py-5">
              <dt className="text-[18px] font-semibold text-stone-900">{d.title}</dt>
              <dd className="mt-1.5 text-[16px] leading-relaxed text-stone-600">{d.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[40px]">When another tool may suit you better</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-stone-600">Invytra does one thing. If you need one of these, it isn't the right fit yet.</p>
        </div>
        <dl className="divide-y divide-stone-900/10 border-y border-stone-900/10">
          {OTHERS.map((o) => (
            <div key={o.need} className="py-5">
              <dt className="text-[18px] font-semibold text-stone-900">{o.need}</dt>
              <dd className="mt-1.5 text-[16px] leading-relaxed text-stone-600">{o.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-20 flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-stone-900 px-8 py-10 text-white sm:px-12">
        <p className="max-w-[560px] font-display text-[28px] font-semibold leading-snug sm:text-[34px]">
          Try it with up to {TRIAL.maxSenders} accounts for {TRIAL.days} days, free.
        </p>
        <Link href="/signup" className="rounded-xl bg-brand-400 px-5 py-3 text-[16px] font-semibold text-stone-900 hover:bg-brand-300">
          Start your free trial
        </Link>
      </div>
    </div>
  );
}
