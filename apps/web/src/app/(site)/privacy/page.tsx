import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Invytra collects, uses and protects personal data across LinkedIn, email and WhatsApp outreach.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "Who we are",
    body: [
      `Invytra is an outreach platform run by ${SITE.company}, ${SITE.companyPlace} ("we", "us"). It helps businesses reach people on LinkedIn, by email and on WhatsApp, and manage the replies in one place. This policy explains what personal data we handle when you visit our website or use Invytra, and the choices you have.`,
    ],
  },
  {
    title: "Data we collect",
    body: [
      "Your account:",
      [
        "Your name, company name and email address, and a one-way hash of your password (we never store the password itself).",
        "Your workspace settings, teammates and plan.",
      ],
      "Leads and contacts you bring to Invytra:",
      [
        "Lists you upload, paste or import: names, companies, job titles, LinkedIn profile links, email addresses, phone numbers and any other columns in your file.",
        "The opt-in details you record for WhatsApp contacts (how and when they agreed to hear from you).",
        "The do-not-contact list: people who unsubscribed, replied asking to stop, or whose emails bounced.",
      ],
      "LinkedIn:",
      [
        "The logged-in session for each LinkedIn account you connect, stored encrypted. You log in to LinkedIn yourself in a secure window; we never see or store your LinkedIn password.",
        "Information shown on LinkedIn for the people in your campaigns, such as their name, headline, connection status, and the email address they share with their connections.",
        "Messages and replies in the conversations your campaigns start.",
      ],
      "Email:",
      [
        "The mailboxes you connect: address, server settings and password or app password, stored encrypted.",
        "The emails Invytra sends for you, the replies, bounces and unsubscribe requests it reads from those mailboxes, and warm-up emails exchanged between mailboxes.",
        "The results of email address checks you ask us to run.",
      ],
      "WhatsApp:",
      [
        "When you connect a WhatsApp Business number through Meta, the identifiers Meta shares with us for that number and account (such as the phone number ID, business account ID and display name) and an access token, stored encrypted.",
        "Your message templates, the messages Invytra sends for you, the messages your contacts send back (including media), and delivery and read status from WhatsApp.",
      ],
      "Created as Invytra works for you:",
      [
        "A record of each action (profile visits, invites, emails, WhatsApp messages and inbox checks) with its result, and, when an action fails, a screenshot of the page.",
        "Text you ask the AI writer to draft, and its drafts.",
      ],
      "Payments are collected by our payment providers. We receive only what we need to manage your subscription and credits, never full card numbers.",
      "We use one essential cookie to keep you signed in. We don't use advertising or cross-site tracking cookies.",
    ],
  },
  {
    title: "How we use it",
    body: [
      [
        "To provide the service: running your campaigns on each channel, showing replies in your inbox, checking email addresses, and keeping each account within its limits and working hours.",
        "To keep accounts secure, and to detect and stop spam and misuse.",
        "To bill you, send service emails (such as password resets), and answer support requests.",
        "To meet legal obligations.",
      ],
      "We don't sell personal data, we don't use your leads or messages to market to anyone, and we don't use them to train AI models.",
    ],
  },
  {
    title: "Your leads' data",
    body: [
      "For the people in your lists, campaigns and inbox, you decide why and how their data is used; we process it only on your instructions, to provide the service. You are responsible for having a lawful basis to contact them, for following the rules of each channel (including getting opt-in before messaging anyone on WhatsApp), and for honouring their requests. Invytra helps with unsubscribe links, bounce handling and a do-not-contact list on every campaign.",
    ],
  },
  {
    title: "WhatsApp and Meta",
    body: [
      "Our WhatsApp features use Meta's official WhatsApp Business Platform. When you connect a number, you authorise Meta to share that account's details with Invytra, and messages are sent and received through Meta's systems under the WhatsApp Business terms and Meta's own privacy policy.",
      "We use the data we receive from Meta only to provide the WhatsApp features you use in Invytra: connecting your number, managing templates, sending your messages and showing replies and delivery status. We don't sell it, use it for advertising, or share it with anyone except as described in this policy.",
      "You can disconnect a WhatsApp number at any time in Invytra, or remove Invytra's access in your Meta Business settings. See our data deletion instructions for how to have the data deleted.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "Service providers that help us run Invytra, under contracts that require them to protect the data and use it only for us:",
      [
        "Cloud hosting and databases.",
        "The secure connection service used to log in to and act on LinkedIn accounts, and the proxy networks used for each account.",
        "Meta, for WhatsApp messaging.",
        "Email address verification.",
        "An AI provider, only for the text you send to the AI writer.",
        "Email delivery for our own service emails, and payment processing.",
      ],
      "We also share data when the law requires it, or to protect people's safety or the security of the service.",
      "Some of these providers process data outside your country. Where that happens, we rely on contracts and safeguards that the law requires.",
    ],
  },
  {
    title: "Security",
    body: [
      "LinkedIn sessions, mailbox passwords, WhatsApp access tokens and proxy credentials are encrypted at rest (AES-256-GCM). Invytra passwords are stored only as bcrypt hashes. Each workspace's data is kept separate, connections use HTTPS, and our team's access is limited to what's needed to run and support the service.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "We keep your data while your account is open. When you disconnect a channel, we delete its stored login details right away. When you close your account, we delete your workspace data within 30 days, except records we must keep by law (for example invoices).",
      "We keep entries on the do-not-contact list for as long as your workspace exists, so people who asked not to be contacted stay protected.",
    ],
  },
  {
    title: "Your rights",
    body: [
      `You can ask to access, correct or delete your personal data, or withdraw consent, by writing to ${SITE.email}. If you are someone a customer of ours contacted, you can also write to us; we will pass the request to that customer and help them act on it. Depending on where you live, laws such as India's Digital Personal Data Protection Act, 2023, the EU and UK GDPR and US state privacy laws give you these rights and the right to complain to a regulator.`,
      "To have data deleted, follow our data deletion instructions (linked at the bottom of every page).",
    ],
  },
  { title: "Children", body: ["Invytra is a business tool for people aged 18 and over. We don't knowingly collect data from children."] },
  {
    title: "Changes",
    body: ["If we change this policy in a way that matters, we'll tell you by email or in the app before the change takes effect."],
  },
  {
    title: "Contact and grievances",
    body: [`Questions, requests or complaints about privacy: ${SITE.email}, or write to ${SITE.company}, ${SITE.companyPlace}. We aim to reply within 7 days.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="6 November 2026"
      intro="Short version: we use your data only to run Invytra for you on LinkedIn, email and WhatsApp. We encrypt every login and token, we never see your LinkedIn password, and we don't sell anything to anyone."
      sections={SECTIONS}
    />
  );
}
