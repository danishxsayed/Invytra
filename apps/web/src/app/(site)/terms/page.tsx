import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service", description: "The terms for using Invytra." };

const SECTIONS: LegalSection[] = [
  {
    title: "These terms",
    body: [
      `These terms are an agreement between you (or the company you represent) and ${SITE.company} ("we", "us") for using Invytra. By creating an account you accept them. If you use Invytra for a company, you confirm you can bind that company.`,
    ],
  },
  {
    title: "The service",
    body: [
      "Invytra automates outreach on LinkedIn for accounts you connect: visiting profiles, sending invitations and messages, and reading replies, within the limits and hours you set. We may improve or change features over time.",
    ],
  },
  {
    title: "Your Invytra account",
    body: [
      "You must be 18 or older and give accurate details. Keep your password private; you're responsible for activity in your workspace. Tell us at once if you think your account has been misused.",
    ],
  },
  {
    title: "LinkedIn accounts and their risk",
    body: [
      "You may only connect LinkedIn accounts that you own or are authorised to use.",
      "LinkedIn's User Agreement does not permit third-party automation. LinkedIn may warn, limit or restrict any account it believes is automated, including accounts used with Invytra. Invytra is designed to reduce this risk, but we can't remove it and don't guarantee any outcome.",
      "You decide whether to use Invytra with an account, and you accept this risk. We aren't responsible for actions LinkedIn takes against an account. Invytra is not affiliated with or endorsed by LinkedIn.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You agree not to use Invytra to:",
      [
        "send spam, or misleading, harassing, abusive or unlawful messages;",
        "contact people or use data in breach of data protection, anti-spam or other applicable laws;",
        "upload data you don't have the right to use;",
        "get around the safety limits, attack or overload the service, or copy or reverse engineer it.",
      ],
      "We may pause campaigns or accounts that break these rules.",
    ],
  },
  {
    title: "Your data",
    body: [
      "You own the lead lists, messages and other content you put into Invytra. You give us permission to process it only to provide the service to you. Our Privacy policy explains how we handle personal data.",
    ],
  },
  {
    title: "Trial, fees and billing",
    body: [
      `New workspaces get a ${SITE.trialDays}-day free trial. After that, Invytra costs $${SITE.price.usd} per connected LinkedIn account per month, or the price shown at checkout, plus applicable taxes such as GST.`,
      "Subscriptions renew monthly until cancelled. You can cancel any time; the service continues until the end of the paid month. Fees already paid aren't refunded for partial months, except where the law requires.",
      "We'll give you at least 30 days' notice of any price change.",
    ],
  },
  {
    title: "Suspension and ending",
    body: [
      "You can close your workspace at any time. We may suspend or end access if you seriously or repeatedly break these terms, or if the law requires it. After closing, you can ask us for an export of your data for 30 days.",
    ],
  },
  {
    title: "Disclaimers",
    body: [
      "Invytra is provided as it is. We work to keep it reliable but don't promise it will be uninterrupted or error-free, or that your outreach will get any particular result.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the extent the law allows, we aren't liable for indirect or consequential losses, lost profits, or the loss or restriction of a LinkedIn account, and our total liability is limited to the fees you paid us in the 12 months before the claim.",
    ],
  },
  {
    title: "Indemnity",
    body: ["You'll compensate us for claims arising from content you send through Invytra or from your breach of these terms."],
  },
  {
    title: "Changes to these terms",
    body: ["We'll tell you about important changes at least 30 days before they apply. Continuing to use Invytra after that means you accept them."],
  },
  {
    title: "Law and disputes",
    body: ["These terms are governed by the laws of India. The courts of Karnataka, India have jurisdiction over any dispute."],
  },
  { title: "Contact", body: [`${SITE.company}, ${SITE.companyPlace}. Email: ${SITE.email}`] },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="24 October 2026"
      intro="The rules for using Invytra, including the one that matters most: LinkedIn doesn't allow automation, so using Invytra with an account carries risk you accept."
      sections={SECTIONS}
    />
  );
}
