import { PLANS, SENDER_ADDON_CENTS, TRIAL, channelById, formatMoney } from "@invytra/shared";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlanCards, PlanCompare } from "@/components/billing/PlanCards";
import { Faq } from "@/components/site/Faq";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Starter ${formatMoney(PLANS.starter.monthlyCents!)} a month for two channels, Growth ${formatMoney(PLANS.growth.monthlyCents!)} for every channel, 15% off yearly, and a ${TRIAL.days}-day free trial.`,
};

const INCLUDED = [
  "Unlimited campaigns, lead lists and contacts",
  "LinkedIn: visits, invites with notes, messages and follow-ups",
  "Email: sequences from your own mailboxes, warm-up and reply tracking",
  "Daily limits, warm-up and office hours, set per sender",
  "One inbox for every channel, with “Needs reply”",
  "AI writing, handwritten, voice and video notes (paid in credits)",
  "Ask Invy: find businesses from a sentence (paid in credits)",
  "Unlimited teammates",
];

const FAQ = [
  {
    q: "What's a sender account?",
    a: `One connected LinkedIn account, one email mailbox, or (soon) one WhatsApp number. Every channel in your plan includes one. Extra LinkedIn senders are ${formatMoney(SENDER_ADDON_CENTS.linkedin!)} a month each, extra mailboxes ${formatMoney(SENDER_ADDON_CENTS.email!)}.`,
  },
  {
    q: "What are credits?",
    a: `One monthly balance for everything AI makes: drafts and personalized notes, handwritten, voice and video notes, and Ask Invy's business search. Starter has ${PLANS.starter.credits} a month, Growth ${PLANS.growth.credits}. Extra packs never expire.`,
  },
  {
    q: "How does the free trial work?",
    a: `${TRIAL.days} days on one channel of your choice, with one sender and ${TRIAL.credits} credits, no card. When it ends, sending stops until you choose a plan; your campaigns, contacts and results stay.`,
  },
  {
    q: "Which channels are there?",
    a: `LinkedIn and Email today; WhatsApp is on its way${channelById("whatsapp")?.status === "live" ? "" : " (choose it now and it switches on when it launches)"}. Starter includes any two, Growth all three.`,
  },
  { q: "How does yearly billing work?", a: "Twelve months with 15% off, extra senders included. It renews once a year." },
  {
    q: "Can I change or cancel?",
    a: "Yes. More senders or a bigger plan apply right away (you pay the difference for the days left); less applies from your next renewal. Cancelling keeps your plan until the end of the period you paid for.",
  },
  { q: "How do I pay?", a: "By card in US dollars, through Razorpay. Plans renew automatically; every payment has an invoice on your Billing page." },
];

export default function PricingPage() {
  const whatsappLive = channelById("whatsapp")?.status === "live";
  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-16">
      <div className="mx-auto max-w-[720px] text-center">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[58px]">Simple plans for every channel.</h1>
        <p className="mt-5 text-[19px] leading-relaxed text-stone-600">
          Pick your channels, add the senders you need, and pay monthly or save 15% yearly. Start with a {TRIAL.days}-day free trial.
        </p>
      </div>

      <div className="mt-12">
        <PlanCards mode="site" signupHref="/signup" contactHref={`mailto:${SITE.email}?subject=${encodeURIComponent("Invytra custom VIP plan")}`} whatsappLive={whatsappLive} />
      </div>

      <section className="mt-20">
        <h2 className="font-display text-[30px] font-bold tracking-[-0.02em] text-stone-900">Compare plans</h2>
        <div className="mt-6">
          <PlanCompare />
        </div>
      </section>

      <section className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[30px] font-bold tracking-[-0.02em] text-stone-900">In every plan</h2>
          <ul className="mt-6 grid gap-3.5">
            {INCLUDED.map((i) => (
              <li key={i} className="flex items-start gap-3 text-[17px] text-stone-800">
                <Check className="mt-1 h-5 w-5 shrink-0 text-brand-800" strokeWidth={2.5} aria-hidden />
                {i}
              </li>
            ))}
          </ul>
        </div>
        <div className="self-start rounded-2xl bg-white px-6 py-6 text-[16px] leading-relaxed text-stone-700">
          <p className="font-display text-[22px] font-semibold text-stone-900">More than a few senders?</p>
          <p className="mt-2">
            Agencies and larger teams get a custom VIP plan: your channels, credits and sender limits, with dedicated support. Write to{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
              {SITE.email}
            </a>
            .
          </p>
          <p className="mt-4">
            <Link href="/compare" className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
              See how Invytra compares
            </Link>{" "}
            with Expandi, HeyReach and others.
          </p>
        </div>
      </section>

      <section className="mt-20 max-w-[860px]">
        <h2 className="font-display text-[34px] font-bold tracking-[-0.02em] text-stone-900">Billing questions</h2>
        <div className="mt-8">
          <Faq items={FAQ} />
        </div>
      </section>
    </div>
  );
}
