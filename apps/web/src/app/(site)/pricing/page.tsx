import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/site/Faq";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `One plan: $${SITE.price.usd} per LinkedIn account a month, with every feature and a ${SITE.trialDays}-day free trial.`,
};

const INCLUDED = [
  "Unlimited campaigns and lead lists",
  "Profile visits, invites with notes, messages and follow-ups",
  "Waits for acceptance and stops on reply",
  "Daily limits, warm-up and office hours, set per account",
  "Lead import from CSV, with a preview before saving",
  "Inbox with “Needs reply”, and a full activity log with screenshots",
  "Runs in the cloud: one browser per account, no extension",
  "Your whole team in one workspace",
];

const FAQ = [
  {
    q: "What counts as an account?",
    a: "Each LinkedIn profile you connect to Invytra. Teammates who log in to Invytra don't cost anything; only connected LinkedIn accounts do.",
  },
  {
    q: "How does the free trial work?",
    a: `You get ${SITE.trialDays} days with every feature. If you don't choose a plan by the end, campaigns pause and nothing is charged.`,
  },
  { q: "Can I cancel any time?", a: "Yes. Plans are monthly. Cancel from your settings and your campaigns stop at the end of the month you've paid for." },
  {
    q: "Which currencies can I pay in?",
    a: "Cards in US dollars, and customers in India can pay in rupees through Razorpay. Taxes such as GST are added where they apply.",
  },
  { q: "I run outreach for many clients. Is there a volume price?", a: `Write to ${SITE.email} with how many accounts you run and we'll work something out.` },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-16">
      <div className="max-w-[640px]">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[58px]">One plan, everything in it</h1>
        <p className="mt-5 text-[19px] leading-relaxed text-stone-600">
          Pay for each LinkedIn account you connect. Every feature is included from the start, and there are no setup fees.
        </p>
      </div>

      <div className="mt-12 grid overflow-hidden rounded-[28px] border border-stone-900/10 bg-white lg:grid-cols-[0.85fr_1.15fr]">
        <div className="bg-brand-400 p-8 sm:p-10">
          <p className="text-[17px] font-semibold text-stone-900">Invytra</p>
          <p className="mt-6 flex items-end gap-2">
            <span className="font-display text-[84px] font-bold leading-[0.85] tracking-[-0.04em] text-stone-900">${SITE.price.usd}</span>
            <span className="pb-1 text-[17px] text-stone-800">per account
              <br />
              per month
            </span>
          </p>
          <p className="mt-6 max-w-[320px] text-[16px] leading-relaxed text-stone-800">
            Start with a {SITE.trialDays}-day free trial. Add or remove accounts whenever you like.
          </p>
          <Link href="/signup" className="mt-8 inline-flex rounded-xl bg-stone-900 px-5 py-3 text-[16px] font-semibold text-white hover:bg-stone-700">
            Start your free trial
          </Link>
        </div>
        <ul className="grid content-center gap-4 p-8 sm:p-10">
          {INCLUDED.map((i) => (
            <li key={i} className="flex items-start gap-3 text-[17px] text-stone-800">
              <Check className="mt-1 h-5 w-5 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
              {i}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-[15px] text-stone-500">
        Invytra does LinkedIn only: no cold email or WhatsApp. See how it compares on{" "}
        <Link href="/compare" className="font-medium text-stone-800 underline decoration-brand-500 decoration-2 underline-offset-4">
          price and features
        </Link>
        .
      </p>

      <section className="mt-20 max-w-[860px]">
        <h2 className="font-display text-[34px] font-bold tracking-[-0.02em] text-stone-900">Billing questions</h2>
        <Faq items={FAQ} />
      </section>
    </div>
  );
}
