import { PLANS, SENDER_ADDON_CENTS, TRIAL, formatMoney } from "@invytra/shared";
import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description: "How cancelling an Invytra plan works, when payments are refunded, and how to ask for a refund.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "Free trial",
    body: [`Every new workspace starts with a ${TRIAL.days}-day free trial. No card is needed and nothing is charged. When the trial ends, sending stops until you choose a plan; your data is kept.`],
  },
  {
    title: "Subscriptions",
    body: [
      `Plans are billed in advance, monthly or yearly, in US dollars: Starter ${formatMoney(PLANS.starter.monthlyCents!)} a month, Growth ${formatMoney(PLANS.growth.monthlyCents!)} a month, extra LinkedIn senders ${formatMoney(SENDER_ADDON_CENTS.linkedin!)} and extra email mailboxes ${formatMoney(SENDER_ADDON_CENTS.email!)} a month each, with 15% off yearly. Custom VIP plans are billed as agreed. Plans renew automatically until cancelled.`,
    ],
  },
  {
    title: "Cancelling",
    body: [
      "You can cancel any time on the Billing page of your workspace (workspace owners only), or by writing to us. Cancelling stops the next renewal: your plan keeps working until the end of the period you've paid for, and you won't be charged again.",
      "After that, sending stops and your campaigns, contacts and results stay in your workspace, so you can come back to them. You can delete your workspace and its data at any time in Workspace settings.",
    ],
  },
  {
    title: "Changing plans",
    body: [
      "Moving to a bigger plan or adding senders applies straight away: you pay only the difference for the days left in the current period. Moving to a smaller plan or removing senders applies from your next renewal, so you keep what you paid for until then; the difference isn't refunded.",
    ],
  },
  {
    title: "Refunds",
    body: [
      "Subscription fees and credit packs are paid for a period or for credits that are available right away, so they aren't refunded for partial periods or unused credits, except where the law requires.",
      "We always refund in full:",
      [
        "a payment taken twice for the same thing;",
        "a renewal charged after you cancelled in time;",
        "any other charge made in error on our side.",
      ],
      "If Invytra was unavailable for a long time because of a problem on our side, write to us: we'll look at it case by case and may refund or extend your plan.",
    ],
  },
  {
    title: "How to ask for a refund",
    body: [
      `Write to ${SITE.email} from the email you log in with, within 30 days of the payment, with your workspace name and the invoice number (it's on your Billing page). We reply within 3 business days.`,
      "Approved refunds go back to the card or account you paid with, through our payment provider Razorpay. Banks usually show them within 5–7 business days.",
    ],
  },
  {
    title: "Chargebacks",
    body: ["If something's wrong with a charge, please write to us first: it's the fastest way to fix it. While a card dispute is open, we may pause the workspace's sending."],
  },
  {
    title: "Contact",
    body: [`${SITE.company}, ${SITE.companyPlace}. Email ${SITE.email}${SITE.phone ? `, phone ${SITE.phone}` : ""}.`],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and cancellation policy"
      updated="November 13, 2026"
      intro={`How cancelling works, when we refund, and how to ask. This policy is part of our Terms of service and applies to every Invytra plan and purchase made with ${SITE.company}.`}
      sections={SECTIONS}
    />
  );
}
