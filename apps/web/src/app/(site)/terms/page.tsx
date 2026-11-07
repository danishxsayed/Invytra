import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service", description: "The terms for using Invytra for outreach on LinkedIn, email and WhatsApp." };

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
      "Invytra is an outreach platform. For the accounts you connect, it can:",
      [
        "on LinkedIn: visit profiles, send invitations and messages, and read replies;",
        "by email: send campaigns and follow-ups from your own mailboxes, warm mailboxes up, read replies and bounces, and check email addresses;",
        "on WhatsApp: send approved templates and messages from your WhatsApp Business number and receive replies;",
        "help you write messages with an AI writer, and manage every reply in one inbox.",
      ],
      "It works within the limits, hours and settings you choose. We may improve or change features over time, and add new channels.",
    ],
  },
  {
    title: "Your Invytra account",
    body: [
      "You must be 18 or older and give accurate details. Keep your password private; you're responsible for everything done in your workspace, including by teammates you invite. Tell us at once if you think your account has been misused.",
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
    title: "Email",
    body: [
      "You may only connect mailboxes and domains you own or are authorised to use. Emails are sent from your mailboxes, as you, so you are the sender for every law and provider rule.",
      [
        "Follow the email and anti-spam laws that apply to you and your recipients (such as CAN-SPAM in the US, GDPR and ePrivacy in the EU and UK, and CASL in Canada), including identifying yourself and giving a working way to opt out.",
        "Keep the unsubscribe link and the do-not-contact list in use; never email people who asked you to stop.",
        "Follow your email provider's rules (for example Google Workspace or Microsoft 365).",
      ],
      "Warm-up, verification and sending limits improve delivery but cannot guarantee that emails reach the inbox. We may pause sending from a mailbox or campaign with unusually high bounces, spam complaints or unsubscribes, to protect you and other customers.",
    ],
  },
  {
    title: "WhatsApp",
    body: [
      "WhatsApp features use Meta's official WhatsApp Business Platform. When you connect a number, you also agree to Meta's WhatsApp Business terms and policies, including the WhatsApp Business Messaging Policy and Commerce Policy, and you are responsible for following them.",
      [
        "Only message people who have opted in to hear from you on WhatsApp, and record how and when they did.",
        "Use approved templates when the 24-hour customer service window is closed, and honour opt-out requests at once.",
        "Don't send content Meta's policies don't allow.",
      ],
      "Meta decides on template approval, your number's quality rating and messaging limits, and may restrict or disable a number. We aren't responsible for Meta's decisions. Meta charges for some WhatsApp messages; those charges are billed to you as shown in Invytra or by Meta, in addition to your plan.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "On every channel, you agree not to use Invytra to:",
      [
        "send spam, or misleading, harassing, abusive, hateful or unlawful messages;",
        "impersonate anyone or hide who you are;",
        "contact people or use data in breach of data protection, anti-spam, telemarketing or other applicable laws;",
        "upload or import data you don't have the right to use;",
        "promote illegal products or services, or anything the channel's own rules forbid;",
        "get around the safety limits, attack or overload the service, or copy or reverse engineer it.",
      ],
      "We may pause campaigns, channels or workspaces that break these rules, and, where the law requires, report illegal activity.",
    ],
  },
  {
    title: "AI writer",
    body: [
      "The AI writer drafts messages from what you give it. Drafts can be wrong or unsuitable, so review and edit them before sending; you are responsible for everything you send. Don't put sensitive personal data into the AI writer.",
    ],
  },
  {
    title: "Your data",
    body: [
      "You own the leads, contacts, messages and other content you put into Invytra. You give us permission to process it only to provide the service to you. For the people you contact, you decide how their data is used and you're responsible for having a lawful basis to contact them. Our Privacy policy explains how we handle personal data.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "Invytra relies on other services to work, including LinkedIn, the email providers you connect, Meta for WhatsApp, and providers that help us connect accounts, verify emails, run the AI writer, host the service and take payments. Their availability and rules are outside our control, and a change on their side can limit or stop a feature. We'll tell you as soon as we can when that happens.",
    ],
  },
  {
    title: "Trial, fees and billing",
    body: [
      `New workspaces get a ${SITE.trialDays}-day free trial. After that, Invytra is charged according to your plan on our pricing page, or the price shown at checkout, plus applicable taxes such as GST.`,
      "Monthly subscriptions renew monthly and yearly subscriptions yearly, until cancelled. Anything added during a period, such as another LinkedIn account, is charged for the part of the period that's left.",
      "Subscriptions can be cancelled any time; the service continues until the end of the period you have paid for. Fees already paid aren't refunded for partial periods, except where the law requires.",
      "We'll give you at least 30 days' notice of any price change.",
    ],
  },
  {
    title: "Email verification credits",
    body: [
      "Paid plans include a monthly allowance of email verification credits; it resets on the 1st of each month and unused monthly credits don't carry over. Extra credit packs you buy don't expire while your workspace is open.",
      "One credit is used for each address checked in depth. Credits have no cash value, can't be transferred, and aren't refundable once bought, except where the law requires. Verification results are a best estimate and can't guarantee that an email will be delivered.",
    ],
  },
  {
    title: "Suspension and ending",
    body: [
      "You can close your workspace at any time. We may suspend or end access if you seriously or repeatedly break these terms, if a channel provider requires it, or if the law requires it. Where we can, we'll warn you first and give you a chance to fix the problem. After closing, you can ask us for an export of your data for 30 days.",
    ],
  },
  {
    title: "Disclaimers",
    body: [
      "Invytra is provided as it is. We work to keep it reliable but don't promise it will be uninterrupted or error-free, or that your outreach will get any particular result, reply rate or delivery rate.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the extent the law allows, we aren't liable for indirect or consequential losses, lost profits, or the loss, restriction or suspension of a LinkedIn account, mailbox, domain or WhatsApp number, and our total liability is limited to the fees you paid us in the 12 months before the claim.",
    ],
  },
  {
    title: "Indemnity",
    body: ["You'll compensate us for claims arising from content you send through Invytra, from the data you upload, or from your breach of these terms or of a channel's rules."],
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
      updated="7 November 2026"
      intro="The rules for using Invytra on LinkedIn, email and WhatsApp. The short version: contact people lawfully and only where each channel allows it, and know that LinkedIn doesn't allow automation, so using Invytra with a LinkedIn account carries a risk you accept."
      sections={SECTIONS}
    />
  );
}
