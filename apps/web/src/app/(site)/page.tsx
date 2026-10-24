import { ClipboardList, Eye, FileSpreadsheet, History, Inbox, MessageSquare, Repeat2, ScanEye, UserPlus, UserX, UsersRound, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Faq } from "@/components/site/Faq";
import { PacingWeek } from "@/components/site/PacingWeek";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Invytra — LinkedIn outreach at a human pace" },
  description: `Invytra visits profiles, sends invites and follows up on LinkedIn for you, inside working hours and safe daily limits, and stops when someone replies. $${SITE.price.usd} per account a month.`,
};

const JOURNEY: { when: string; title: string; body: string; icon: LucideIcon }[] = [
  { when: "Day 1", title: "Visit", icon: Eye, body: "Invytra opens their profile, the way you would before reaching out." },
  { when: "Day 2", title: "Invite", icon: UserPlus, body: "A connection request, with your note if you wrote one. Their first name and company come from your list." },
  { when: "Up to 21 days", title: "Wait", icon: Repeat2, body: "It checks about once a day whether they accepted. Messages only go to people who did." },
  { when: "A day after they accept", title: "Message", icon: MessageSquare, body: "Your first message, written by you, with their details filled in." },
  { when: "4 days later", title: "Follow up", icon: History, body: "Only if they haven't replied. A reply stops everything for that person." },
];

const SAFETY: { title: string; body: string }[] = [
  { title: "20 invites a day to start", body: "You can raise it to 40. A weekly cap of 150 sits on top, well inside what people send by hand." },
  { title: "No two days look the same", body: "Each day stops somewhere between 80% and 100% of your limit, so there's no fixed pattern to spot." },
  { title: "New accounts warm up", body: "For the first 14 days, limits start at about a third and grow day by day." },
  { title: "Office hours only", body: "Monday to Friday, 09:00 to 18:00 in the account's own time zone, with minutes of gap between actions." },
  { title: "Stops at the first sign of trouble", body: "A security check, captcha or restriction notice pauses the account at once and saves a screenshot. Nothing retries on its own." },
  { title: "Your password stays yours", body: "You log in to LinkedIn yourself in a secure window inside Invytra. We keep only the encrypted session." },
];

const FEATURES: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Lead lists from any CSV",
    icon: FileSpreadsheet,
    body: "Upload a Sales Navigator, Apollo or Excel export, or paste profile links. Invytra finds the right columns and shows you what it will add before saving.",
  },
  {
    title: "Preview with real names",
    icon: ScanEye,
    body: "See each note and message exactly as a lead from your list will get it. If a detail is missing, that person is skipped instead of getting “Hi ,”.",
  },
  {
    title: "Nobody hears from you twice",
    icon: UserX,
    body: "People any of your accounts already invited or messaged, or who are in another campaign, are skipped automatically.",
  },
  {
    title: "An inbox that says who to answer",
    icon: Inbox,
    body: "Replies arrive linked to the person and campaign. Once you answer on LinkedIn, they move out of “Needs reply” on their own.",
  },
  {
    title: "Every action on record",
    icon: ClipboardList,
    body: "A full log of visits, invites and messages. When something fails, you see a screenshot of what LinkedIn showed at that moment.",
  },
  {
    title: "Several accounts, one workspace",
    icon: UsersRound,
    body: "Run your team's LinkedIn accounts side by side, each with its own limits, hours and time zone.",
  },
];

const FAQ = [
  {
    q: "Is automating LinkedIn allowed?",
    a: "LinkedIn's User Agreement doesn't allow automation tools, so every product in this category carries some risk to the account using it. Invytra keeps that risk low with conservative limits, office hours and an immediate stop on any warning, but the account and how it's used remain your responsibility.",
  },
  { q: "Do I need to keep my computer on?", a: "No. Invytra runs each account in its own browser in the cloud, so campaigns keep going when your laptop is closed." },
  {
    q: "Do you store my LinkedIn password?",
    a: "No. You type it into LinkedIn yourself, in a secure window inside Invytra, including any verification code. We keep only the logged-in session, encrypted.",
  },
  {
    q: "Does it work with Sales Navigator?",
    a: "You can upload Sales Navigator CSV exports. Importing straight from a Sales Navigator search isn't available yet.",
  },
  {
    q: "What happens when my free account runs out of invite notes?",
    a: "LinkedIn gives free accounts a few custom notes a month. When they run out, Invytra sends the invite without a note and tells you so in the activity log.",
  },
  { q: "Does Invytra send emails or WhatsApp messages?", a: "No. Invytra is LinkedIn only, and does that one thing carefully." },
  { q: "Can I cancel any time?", a: `Yes. Plans are monthly with no contract, and every plan starts with a ${SITE.trialDays}-day free trial.` },
];

function Cta({ href, children, dark }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      className={
        dark
          ? "inline-flex items-center justify-center rounded-xl bg-stone-900 px-5 py-3 text-[16px] font-semibold text-white transition hover:bg-stone-700"
          : "inline-flex items-center justify-center rounded-xl border border-stone-900/15 bg-white px-5 py-3 text-[16px] font-semibold text-stone-900 transition hover:border-stone-900/30"
      }
    >
      {children}
    </Link>
  );
}

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1fr_1.05fr] lg:pt-20">
        <div className="max-w-[560px]">
          <h1 className="font-display text-[46px] font-bold leading-[1.02] tracking-[-0.025em] text-stone-900 sm:text-[60px] lg:text-[66px]">
            LinkedIn outreach at a human pace.
          </h1>
          <p className="mt-6 text-[19px] leading-relaxed text-stone-600">
            Invytra visits profiles, sends invites and follows up for you, inside your working hours and under safe daily limits. It stops the
            moment someone replies.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Cta href="/signup" dark>
              Start your free trial
            </Cta>
            <Cta href="/pricing">See pricing</Cta>
          </div>
          <p className="mt-5 text-[15px] text-stone-500">
            ${SITE.price.usd} per LinkedIn account a month. {SITE.trialDays}-day free trial. No browser extension.
          </p>
        </div>
        <PacingWeek />
      </section>

      <section id="how" className="scroll-mt-20 border-y border-stone-900/[0.07] bg-white/60">
        <div className="mx-auto max-w-[1180px] px-5 py-20">
          <h2 className="max-w-[640px] font-display text-[36px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[44px]">
            What happens to one person on your list
          </h2>
          <p className="mt-4 max-w-[600px] text-[18px] leading-relaxed text-stone-600">
            You write the note and the messages once. Each lead then moves through them on their own clock.
          </p>
          <ol className="mt-12 grid gap-8 md:grid-cols-5 md:gap-5">
            {JOURNEY.map((s, i) => (
              <li key={s.title} className="relative md:pt-10">
                {i < JOURNEY.length - 1 && <span aria-hidden className="absolute left-5 top-5 hidden h-px w-[calc(100%+1.25rem)] bg-stone-300 md:block" />}
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-brand-400 text-stone-900 md:absolute md:left-0 md:top-0">
                  <s.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <p className="mt-4 text-[14px] font-medium text-brand-800">{s.when}</p>
                <p className="mt-1 font-display text-[22px] font-semibold text-stone-900">{s.title}</p>
                <p className="mt-2 text-[16px] leading-relaxed text-stone-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-12 rounded-2xl bg-canvas px-6 py-5 text-[17px] leading-relaxed text-stone-700">
            Setting up takes about ten minutes: log in to LinkedIn in a secure window, upload your list, write your messages, check the preview and
            launch.
          </p>
        </div>
      </section>

      <section id="safety" className="scroll-mt-20 mx-auto grid max-w-[1180px] gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-[36px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[44px]">Careful by default</h2>
          <p className="mt-4 max-w-[460px] text-[18px] leading-relaxed text-stone-600">
            LinkedIn restricts accounts that behave like software. Invytra is built to behave like a busy, consistent person, and these settings are
            on from the first day.
          </p>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-stone-500">
            No tool can promise LinkedIn will never restrict an account. These defaults keep you well inside the limits people use by hand.
          </p>
        </div>
        <dl className="divide-y divide-stone-900/10 border-y border-stone-900/10">
          {SAFETY.map((s) => (
            <div key={s.title} className="grid gap-1 py-5 sm:grid-cols-[220px_1fr] sm:gap-6">
              <dt className="font-display text-[19px] font-semibold text-stone-900">{s.title}</dt>
              <dd className="text-[16px] leading-relaxed text-stone-600">{s.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-y border-stone-900/[0.07] bg-white/60">
        <div className="mx-auto max-w-[1180px] px-5 py-20">
          <h2 className="font-display text-[36px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[44px]">Everything else you need</h2>
          <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="h-6 w-6 text-stone-900" strokeWidth={1.75} aria-hidden />
                <h3 className="mt-3 text-[18px] font-semibold text-stone-900">{f.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-stone-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="grid items-center gap-10 rounded-[28px] bg-brand-400 px-7 py-10 sm:px-12 sm:py-12 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="font-display text-[56px] font-bold leading-none tracking-[-0.03em] text-stone-900 sm:text-[72px]">${SITE.price.usd}</p>
            <p className="mt-3 max-w-[520px] text-[19px] leading-relaxed text-stone-900">
              per LinkedIn account, per month. Every feature, unlimited campaigns and lead lists, and your whole team at no extra cost.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:flex-col">
            <Cta href="/signup" dark>
              Start your free trial
            </Cta>
            <Cta href="/compare">Compare with others</Cta>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[860px] px-5 pb-24">
        <h2 className="font-display text-[36px] font-bold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[44px]">Questions</h2>
        <Faq items={FAQ} />
      </section>
    </>
  );
}
