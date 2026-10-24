import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", description: "How Invytra collects, uses and protects personal data." };

const SECTIONS: LegalSection[] = [
  {
    title: "Who we are",
    body: [
      `Invytra is run by ${SITE.company}, ${SITE.companyPlace} ("we", "us"). This policy explains what personal data we handle when you visit our website or use the Invytra service, and the choices you have.`,
    ],
  },
  {
    title: "Data we collect",
    body: [
      "Data you give us:",
      [
        "Account details: your name, company name, email address and a one-way hash of your password (we never store the password itself).",
        "Lead lists you upload or paste: LinkedIn profile links and any other columns in your file, such as names, companies and job titles.",
        "The notes and messages you write for campaigns, and the settings you choose.",
        "Proxy details you add for a LinkedIn account, stored encrypted.",
      ],
      "Data created when Invytra works for you:",
      [
        "The logged-in LinkedIn session for each account you connect, stored encrypted. You type your LinkedIn password into LinkedIn yourself; we never see or store it.",
        "Information shown on LinkedIn pages Invytra visits for you, such as a lead's name and connection status.",
        "Replies from your LinkedIn inbox, so you can see and manage them in Invytra.",
        "A record of every action (visits, invites, messages and inbox checks) and, when an action fails, a screenshot of the page.",
      ],
      "Payment details are collected and stored by our payment providers (Stripe and Razorpay). We receive only what we need to manage your subscription, never full card numbers.",
      "We use one essential cookie to keep you signed in. We don't use advertising or cross-site tracking cookies.",
    ],
  },
  {
    title: "How we use it",
    body: [
      [
        "To provide the service: running your campaigns, showing your inbox and activity, and keeping your accounts within the limits you set.",
        "To keep accounts secure and to detect and stop misuse.",
        "To bill you, send service emails, and answer support requests.",
        "To meet legal obligations.",
      ],
      "We don't sell personal data, and we don't use your leads or messages to market to anyone.",
    ],
  },
  {
    title: "Your leads' data",
    body: [
      "For the people in your lead lists and inbox, you decide why and how their data is used; we process it only on your instructions to provide the service. You're responsible for having a lawful basis to contact them and for honouring their requests, and we'll help you do that.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "Service providers that help us run Invytra, under contracts that require them to protect the data: cloud hosting, proxy networks used to connect each LinkedIn account, email delivery, and payment processing. We also share data when the law requires it.",
    ],
  },
  {
    title: "Security",
    body: [
      "LinkedIn sessions and proxy credentials are encrypted at rest (AES-256-GCM). Passwords for Invytra are stored only as bcrypt hashes. Each workspace's data is kept separate, and access by our team is limited to what's needed to run and support the service.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "We keep your data while your account is open. When you close it, we delete your workspace data within 30 days, except where we must keep records (for example invoices) by law.",
    ],
  },
  {
    title: "Your rights",
    body: [
      `You can ask to access, correct or delete your personal data, or withdraw consent, by writing to ${SITE.email}. Depending on where you live, laws such as India's Digital Personal Data Protection Act, 2023 and the EU and UK GDPR give you these rights and the right to complain to a regulator.`,
    ],
  },
  { title: "Children", body: ["Invytra is a business tool for people aged 18 and over. We don't knowingly collect data from children."] },
  {
    title: "Changes",
    body: ["If we change this policy in a way that matters, we'll tell you by email or in the app before the change takes effect."],
  },
  {
    title: "Contact and grievances",
    body: [`Questions, requests or complaints about privacy: ${SITE.email}. We aim to reply within 7 days.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="24 October 2026"
      intro="Short version: we use your data to run Invytra for you, we encrypt the sensitive parts, we never see your LinkedIn password, and we don't sell anything to anyone."
      sections={SECTIONS}
    />
  );
}
