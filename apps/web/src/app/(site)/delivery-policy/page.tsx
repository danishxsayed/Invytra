import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Delivery policy",
  description: "Invytra is software delivered online: access starts as soon as a payment goes through. Nothing is shipped.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "What we deliver",
    body: ["Invytra is software used in your web browser (software as a service). We don't sell or ship physical goods, so there are no shipping charges, carriers or delivery addresses."],
  },
  {
    title: "When you get access",
    body: [
      "Your account and workspace are ready as soon as you sign up. A plan, extra senders or a credit pack applies to your workspace right after the payment goes through, usually within a minute; you see it on your Billing page.",
      "Each payment gets an invoice, which you can open and download on the Billing page. We also email you about your account at the address you signed up with.",
    ],
  },
  {
    title: "Where",
    body: ["Invytra works anywhere with an internet connection. Some channels depend on other services (for example LinkedIn, your email provider or WhatsApp) and their rules in your country."],
  },
  {
    title: "If something didn't arrive",
    body: [
      `If you paid and your plan or credits don't show within 30 minutes, write to ${SITE.email} with your workspace name and the payment reference from your bank or Razorpay's receipt. We'll apply it or refund it.`,
    ],
  },
  {
    title: "Contact",
    body: [`${SITE.company}, ${SITE.companyPlace}. Email ${SITE.email}${SITE.phone ? `, phone ${SITE.phone}` : ""}.`],
  },
];

export default function DeliveryPolicyPage() {
  return <LegalPage title="Delivery policy" updated="November 13, 2026" intro="How and when you get what you pay for." sections={SECTIONS} />;
}
