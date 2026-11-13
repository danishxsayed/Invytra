import { Building2, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Contact ${SITE.company}, the company behind Invytra: email, phone and address.`,
};

export default function ContactPage() {
  const items = [
    { Icon: Mail, label: "Email", value: SITE.email, href: `mailto:${SITE.email}` },
    ...(SITE.phone ? [{ Icon: Phone, label: "Phone", value: SITE.phone, href: `tel:${SITE.phone.replace(/\s+/g, "")}` }] : []),
  ];
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-16">
      <div className="max-w-[720px]">
        <h1 className="font-display text-[44px] font-bold leading-[1.05] tracking-[-0.025em] text-stone-900 sm:text-[54px]">Contact us</h1>
        <p className="mt-5 text-[18px] leading-relaxed text-stone-700">
          Questions about Invytra, your plan or a payment? Write to us. For billing, include your workspace name and, if it's about a payment, the invoice number from your Billing page.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ Icon, label, value, href }) => (
          <a key={label} href={href} className="rounded-2xl border border-stone-900/10 bg-white p-6 transition hover:border-stone-900/25">
            <Icon className="h-6 w-6 text-stone-700" aria-hidden />
            <p className="mt-4 text-[14px] font-medium text-stone-500">{label}</p>
            <p className="mt-1 text-[18px] font-semibold text-stone-900">{value}</p>
          </a>
        ))}
        <div className="rounded-2xl border border-stone-900/10 bg-white p-6">
          <Building2 className="h-6 w-6 text-stone-700" aria-hidden />
          <p className="mt-4 text-[14px] font-medium text-stone-500">Company</p>
          <address className="mt-1 text-[16px] not-italic leading-relaxed text-stone-900">
            {SITE.address.map((l) => (
              <span key={l} className="block first:font-semibold">
                {l}
              </span>
            ))}
          </address>
        </div>
      </div>
      <p className="mt-10 max-w-[720px] text-[15px] leading-relaxed text-stone-600">
        Invytra is a product of {SITE.company}. See also our{" "}
        <Link href="/refund-policy" className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
          refund and cancellation policy
        </Link>
        ,{" "}
        <Link href="/terms" className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-stone-900 underline decoration-brand-500 decoration-2 underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
