import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data deletion instructions",
  description: "How to delete your Invytra data, including data from WhatsApp and Meta.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "Delete a connected channel",
    body: [
      "Disconnect a LinkedIn account, mailbox or WhatsApp number from its settings page in Invytra. Its stored login details (session, password or access token) are deleted immediately.",
      "For WhatsApp you can also remove Invytra's access in Meta: go to Meta Business Settings → Accounts → WhatsApp accounts (or Integrations → Connected apps), choose Invytra and remove it. We then stop receiving data for that number and delete its access token.",
    ],
  },
  {
    title: "Delete your whole account",
    body: [
      `Email ${SITE.email} from the address you sign in with and ask us to delete your account. We confirm by email, then delete your workspace, its leads, contacts, campaigns, messages and connected channels within 30 days. Records we must keep by law (such as invoices) are kept only as long as required.`,
    ],
  },
  {
    title: "If someone contacted you through Invytra",
    body: [
      `Write to ${SITE.email} with the email address, phone number or LinkedIn profile you were contacted on. We will pass your request to the business that contacted you, help them delete your data, and add you to their do-not-contact list so you are not contacted again. You can also reply "stop" to any WhatsApp message or use the unsubscribe link in any email.`,
    ],
  },
  {
    title: "Confirmation",
    body: ["We reply within 7 days to confirm your request and again when the deletion is complete."],
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data deletion instructions"
      updated="6 November 2026"
      intro="You can delete your data from Invytra at any time, for one channel or for your whole account. Here's how."
      sections={SECTIONS}
    />
  );
}
