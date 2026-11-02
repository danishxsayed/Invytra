import type { Metadata } from "next";
import { Faq } from "@/components/site/Faq";
import { ImageSlot } from "@/components/site/ImageSlot";
import { Bento } from "@/components/site/home/Bento";
import { Careful } from "@/components/site/home/Careful";
import { ChannelStack, type ChannelPanel } from "@/components/site/home/ChannelStack";
import { Closing } from "@/components/site/home/Closing";
import { Hero } from "@/components/site/home/Hero";
import { ChannelMarquee } from "@/components/site/home/Marquee";
import { Scatter } from "@/components/site/home/Scatter";
import { Steps } from "@/components/site/home/Steps";
import { UseCases, type UseCase } from "@/components/site/home/UseCases";
import { Eyebrow, h2 } from "@/components/site/home/bits";
import { Reveal } from "@/components/site/motion";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Invytra — Outreach on LinkedIn, email and WhatsApp, in one place" },
  description:
    "Find the right people, reach them on LinkedIn, email and WhatsApp, and follow up automatically. Every reply lands in one inbox. Start a free trial, no card needed.",
};

const PANELS: ChannelPanel[] = [
  {
    id: "linkedin",
    name: "LinkedIn Outreach",
    title: "Grow your network while you focus on the talking.",
    body: "Invytra visits profiles, sends invites and follows up for you, at a pace that looks like a real, busy person.",
    points: ["Import leads from a LinkedIn search or any CSV", "Safe daily limits and office hours, set for you", "Runs in the cloud, so your laptop can stay closed"],
    image: <ImageSlot id="channel-linkedin" />,
    tint: "bg-[#EEF4FB]",
  },
  {
    id: "email",
    name: "Email Outreach",
    title: "Cold email that reaches the inbox, not the spam folder.",
    body: "Send from mailboxes on your own domains. Invytra spreads the sending, warms new mailboxes up and reads the replies.",
    points: ["Warm-up and daily caps for every mailbox", "Check email addresses before you send", "Unsubscribe and bounce handling built in"],
    image: <ImageSlot id="channel-email" />,
    tint: "bg-[#FBF6E9]",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    title: "Follow up on the app people check first.",
    body: "Send approved messages and follow-ups through the official WhatsApp Business API, and answer in the same inbox.",
    points: ["Official API, approved templates", "Personal details filled in for each person", "Replies arrive next to LinkedIn and email"],
    image: <ImageSlot id="channel-whatsapp" />,
    tint: "bg-[#EAF8EE]",
  },
];

const CASES: UseCase[] = [
  {
    id: "agencies",
    label: "Agencies",
    title: "Run outreach for every client, from one login.",
    body: "Keep each client's accounts, leads and replies apart, and show them results they can see.",
    points: ["Many accounts and mailboxes per workspace", "Separate campaigns per client", "One inbox your team can share"],
    image: <ImageSlot id="usecase-agencies" sizes="100vw" />,
  },
  {
    id: "sales",
    label: "Sales teams",
    title: "Book more meetings without more busywork.",
    body: "Your reps spend their day talking to interested people, not copying messages between tabs.",
    points: ["Multi-step sequences across channels", "Replies stop follow-ups automatically", "Nobody is contacted twice"],
    image: <ImageSlot id="usecase-sales" sizes="100vw" />,
  },
  {
    id: "founders",
    label: "Founders",
    title: "Find your first customers while you build.",
    body: "Set up a campaign in an evening. Invytra keeps reaching out every working day while you work on the product.",
    points: ["Ready-made sequence to start from", "AI writer for your first drafts", "Free trial, no card needed"],
    image: <ImageSlot id="usecase-founders" sizes="100vw" />,
  },
  {
    id: "recruiters",
    label: "Recruiters",
    title: "Reach great candidates before anyone else.",
    body: "Start on LinkedIn, follow up by email or WhatsApp, and keep every conversation in one place.",
    points: ["Import candidates from a search", "Personal notes at scale", "See who replied, on any channel"],
    image: <ImageSlot id="usecase-recruiters" sizes="100vw" />,
  },
];

const FAQ = [
  { q: "What is Invytra?", a: "Invytra is an outreach platform. It reaches people for you on LinkedIn, by email and on WhatsApp, follows up automatically, and puts every reply in one inbox." },
  { q: "Which channels can I use?", a: "LinkedIn, email and WhatsApp. Instagram, SMS, Telegram and more are coming. New channels appear as new steps in the same sequences and inbox." },
  { q: "Do I need to keep my computer on?", a: "No. Campaigns run in the cloud, inside each account's working hours and time zone." },
  { q: "Do you store my LinkedIn password?", a: "No. You log in to LinkedIn yourself in a secure window inside Invytra. We keep only the logged-in session, encrypted." },
  { q: "Will my emails land in spam?", a: "No tool can promise the inbox, but Invytra does what helps most: warm-up, sending caps, rotation across mailboxes, address checks and a review of your domain's settings." },
  { q: "Is automating LinkedIn allowed?", a: "LinkedIn's terms don't allow automation tools, so every tool in this category carries some risk. Invytra keeps it low with careful limits and an immediate stop on any warning." },
  { q: "Can I try it before paying?", a: `Yes. Every account starts with a ${SITE.trialDays}-day free trial, no card needed. After that, monthly plans with no contract.` },
  { q: "Where is Invytra available?", a: "Everywhere. Teams use it in any country and time zone, and campaigns follow each person's local working hours." },
];

export default function Home() {
  return (
    <>
      <Hero dashboard={<ImageSlot id="hero-dashboard" priority sizes="(min-width: 1180px) 1180px, 100vw" />} trialDays={SITE.trialDays} />
      <ChannelMarquee />
      <Scatter
        images={[
          <ImageSlot key="a" id="scatter-founder" sizes="220px" />,
          <ImageSlot key="b" id="scatter-whatsapp" sizes="220px" />,
          <ImageSlot key="c" id="scatter-inbox" sizes="260px" />,
          <ImageSlot key="d" id="scatter-team" sizes="200px" />,
          <ImageSlot key="e" id="scatter-linkedin" sizes="220px" />,
        ]}
      />
      <ChannelStack panels={PANELS} comingSoon={["Instagram", "SMS", "Telegram", "X", "Messenger"]} />
      <Steps />
      <Bento inbox={<ImageSlot id="bento-inbox" sizes="(min-width: 1024px) 760px, 100vw" />} />
      <UseCases cases={CASES} />
      <Careful />
      <section className="mx-auto grid max-w-[1180px] gap-12 px-5 py-28 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className={`${h2} mt-4 text-stone-900`}>Good to know.</h2>
          <p className="mt-5 max-w-[360px] text-[17px] leading-relaxed text-stone-600">
            Something else? Write to us at{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
              {SITE.email}
            </a>
            .
          </p>
        </Reveal>
        <Reveal delay={120}>
          <Faq items={FAQ} />
        </Reveal>
      </section>
      <Closing image={<ImageSlot id="cta-channels" sizes="(min-width: 1024px) 520px, 90vw" />} trialDays={SITE.trialDays} />
    </>
  );
}
