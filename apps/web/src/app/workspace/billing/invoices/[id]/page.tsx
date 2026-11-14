import { prisma } from "@invytra/db";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/LogoMark";
import { PrintButton } from "@/components/billing/PrintButton";
import { requireUser } from "@/lib/auth";
import { getInvoice } from "@/lib/billing";
import { hubHref } from "@/lib/domains";
import { canSeeBilling } from "@/lib/workspace-nav";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const METHOD: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", bank_transfer: "Bank transfer" };

/** One invoice, laid out for printing ("Download PDF" = the browser's Save as PDF). Owner only. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  if (!canSeeBilling(me)) notFound();
  const inv = await getInvoice(prisma, me.workspace.id, (await params).id);
  if (!inv) notFound();
  const s = inv.snapshot;
  const country = (c: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <a href={hubHref("/billing?tab=payments")} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Billing
        </a>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={36} />
            <span className="text-[22px] font-semibold tracking-tight text-stone-900">Invytra</span>
          </div>
          <div className="text-right">
            <p className="text-[26px] font-semibold tracking-tight text-stone-900">Invoice</p>
            <p className="text-[15px] text-stone-600">{inv.number}</p>
            <p className="mt-1 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-semibold text-emerald-800">Paid</p>
          </div>
        </header>

        <div className="mt-10 grid gap-8 text-[14.5px] leading-relaxed sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">From</p>
            <p className="mt-1 font-semibold text-stone-900">{s.seller.name}</p>
            {s.seller.address && <p className="whitespace-pre-line text-stone-600">{s.seller.address}</p>}
            {s.seller.gstin && <p className="text-stone-600">GSTIN: {s.seller.gstin}</p>}
            {s.seller.email && <p className="text-stone-600">{s.seller.email}</p>}
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Billed to</p>
            {s.billedTo ? (
              <>
                <p className="mt-1 font-semibold text-stone-900">{s.billedTo.legalName}</p>
                {s.billedTo.address.map((l) => (
                  <p key={l} className="text-stone-600">
                    {l}
                  </p>
                ))}
                <p className="text-stone-600">{country(s.billedTo.country)}</p>
                {s.billedTo.gstin && <p className="text-stone-600">GSTIN: {s.billedTo.gstin}</p>}
                <p className="text-stone-600">{s.billedTo.email}</p>
              </>
            ) : (
              <p className="mt-1 text-stone-600">{me.workspace.name}</p>
            )}
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-4 rounded-xl bg-stone-50 px-5 py-4 text-[14px] sm:grid-cols-3">
          <div>
            <dt className="text-stone-500">Date paid</dt>
            <dd className="font-medium text-stone-900">{inv.paidAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</dd>
          </div>
          <div>
            <dt className="text-stone-500">Paid with</dt>
            <dd className="font-medium text-stone-900">{(inv.method && METHOD[inv.method]) || inv.method || "Manual payment"}</dd>
          </div>
          {inv.paymentRef && inv.paymentRef !== "manual" && (
            <div>
              <dt className="text-stone-500">Payment reference</dt>
              <dd className="break-all font-medium text-stone-900">{inv.paymentRef}</dd>
            </div>
          )}
        </dl>

        <table className="mt-8 w-full text-left text-[15px]">
          <thead className="border-b border-stone-200 text-[12.5px] uppercase tracking-wide text-stone-400">
            <tr>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {s.lines.map((l) => (
              <tr key={l.description}>
                <td className="py-3 text-stone-800">{l.description}</td>
                <td className="py-3 text-right tabular text-stone-900">{money(l.amountCents, s.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200">
              <td className="pt-4 text-right font-semibold text-stone-900">Total paid</td>
              <td className="pt-4 text-right text-[18px] font-semibold tabular text-stone-900">{money(s.totalCents, s.currency)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-10 text-[13px] text-stone-500">Thank you for using Invytra. Questions about this invoice: reply to your receipt email or contact support.</p>
      </article>
    </div>
  );
}
