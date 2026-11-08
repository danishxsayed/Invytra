import { prisma, razorpayKeys } from "@invytra/db";
import { CheckCircle2, Clock, CreditCard, FileText, Lock, ReceiptText, Sparkles } from "lucide-react";
import { AiCredits } from "@/components/credits/AiCredits";
import { BillingDetails } from "@/components/billing/BillingDetails";
import { VerifyCredits } from "@/components/email/contacts/VerifyCredits";
import { Card, cx } from "@/components/ui";
import { aiUsageThisMonth, getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { listPayments, planOf } from "@/lib/billing";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { getVerifyBalance, listVerifyOrders } from "@/lib/verify-credits";
import { canSeeBilling } from "@/lib/workspace-nav";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const STATUS = { PAID: { text: "Paid", cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" }, PENDING: { text: "Awaiting payment", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" }, CANCELLED: { text: "Cancelled", cls: "bg-stone-100 text-stone-600 ring-stone-500/20" } } as const;
const METHOD: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", bank_transfer: "Bank transfer", manual: "Manual" };

function Heading({ id, icon: Icon, title, hint }: { id?: string; icon: typeof CreditCard; title: string; hint?: string }) {
  return (
    <div id={id} className="scroll-mt-6">
      <h2 className="flex items-center gap-2 text-[19px] font-semibold text-stone-900">
        <Icon className="h-[18px] w-[18px] text-stone-400" aria-hidden /> {title}
      </h2>
      {hint && <p className="mt-0.5 text-[14px] text-stone-500">{hint}</p>}
    </div>
  );
}

/** Billing for the whole workspace: plan, credits and usage, payments and invoices, billing details. Owner only. */
export default async function BillingPage() {
  const me = await requireUser();
  if (!canSeeBilling(me)) {
    return (
      <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-stone-400" aria-hidden />
        <h1 className="mt-3 text-[20px] font-semibold text-stone-900">Billing is for the workspace owner</h1>
        <p className="mt-1 text-[15px] text-stone-500">Ask the owner of {me.workspace.name} about the plan, payments or invoices.</p>
      </Card>
    );
  }
  const ws = me.workspace.id;
  const [full, ai, usage, aiOrders, verify, verifyOrders, payments, profile] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: ws }, select: { plan: true, createdAt: true, channels: true } }),
    getAiBalance(prisma, ws),
    aiUsageThisMonth(prisma, ws),
    listVerifyOrders(prisma, ws, "AI"),
    getVerifyBalance(prisma, ws),
    listVerifyOrders(prisma, ws, "VERIFY"),
    listPayments(prisma, ws),
    prisma.billingProfile.findUnique({ where: { workspaceId: ws } }),
  ]);
  const plan = planOf(full);
  const orders = (rows: typeof aiOrders) => rows.map((o) => ({ id: o.id, credits: o.credits, priceCents: o.priceCents, status: o.status as "PENDING" | "PAID", when: timeAgo(o.createdAt) }));
  const shortDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const online = !!razorpayKeys();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Billing</h1>
        <p className="mt-1 text-[15px] text-stone-500">For all of {me.workspace.name}: every channel shares this plan, these credits and these invoices.</p>
      </div>

      <section className="space-y-4">
        <Heading icon={CreditCard} title="Plan" />
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[24px] font-semibold text-stone-900">{plan.name}</p>
                {plan.trial ? (
                  <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1", plan.trialDaysLeft ? "bg-sky-50 text-sky-800 ring-sky-600/20" : "bg-rose-50 text-rose-800 ring-rose-600/20")}>
                    <Clock className="h-3.5 w-3.5" aria-hidden /> {plan.trialDaysLeft ? `${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} left` : "Trial ended"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-medium text-emerald-800 ring-1 ring-emerald-600/20">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-[15px] text-stone-600">
                {plan.trial && plan.trialEnds ? `Free trial ${plan.trialDaysLeft ? "ends" : "ended"} ${day(plan.trialEnds)}.` : "Your current plan."} Includes {plan.channels.join(", ")}.
              </p>
            </div>
            <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-stone-100 px-3.5 py-2 text-[15px] font-medium text-stone-400">
              Change plan
            </button>
          </div>
          <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-[14px] text-stone-600">
            Plans and prices are being finalised. Upgrading, downgrading, renewing and cancelling open here at launch, and apply to every channel in this workspace.
          </p>
        </Card>
      </section>

      <section className="space-y-4">
        <Heading id="credits" icon={Sparkles} title="Credits and usage" hint="Monthly credits come with your plan; extra packs never expire." />
        <AiCredits c={{ ...ai, resetsOn: shortDay(ai.resetsAt), trial: plan.trial, usage, orders: orders(aiOrders) }} />
        <VerifyCredits c={{ ...verify, resetsOn: shortDay(verify.resetsAt), trial: plan.trial, orders: orders(verifyOrders) }} />
      </section>

      <section className="space-y-4">
        <Heading id="payments" icon={ReceiptText} title="Payments and invoices" hint="Every payment for this workspace. Paid ones have an invoice you can download." />
        <Card className="overflow-hidden">
          {payments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14.5px]">
                <thead className="border-b border-stone-100 text-[12.5px] uppercase tracking-wide text-stone-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">For</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Paid with</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-stone-600">{day(p.paidAt ?? p.createdAt)}</td>
                      <td className="px-5 py-3 text-stone-900">{p.what}</td>
                      <td className="whitespace-nowrap px-5 py-3 font-medium tabular text-stone-900">{money(p.amountCents, p.currency)}</td>
                      <td className="px-5 py-3 text-stone-600">{p.status === "PAID" ? (METHOD[p.method ?? "manual"] ?? p.method) : "—"}</td>
                      <td className="px-5 py-3">
                        <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1", STATUS[p.status].cls)}>{STATUS[p.status].text}</span>
                      </td>
                      <td className="px-5 py-3">
                        {p.invoiceNumber ? (
                          <a href={hubHref(`/billing/invoices/${p.id}`)} className="inline-flex items-center gap-1 font-medium text-stone-800 underline-offset-2 hover:underline">
                            <FileText className="h-4 w-4 text-stone-400" aria-hidden /> {p.invoiceNumber}
                          </a>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-[15px] text-stone-500">No payments yet. They appear here when you buy credits or pay for a plan.</p>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <Heading id="details" icon={FileText} title="Billing details" hint="Who your invoices are made out to." />
        <Card className="p-6">
          <BillingDetails
            value={{
              legalName: profile?.legalName ?? me.workspace.name,
              email: profile?.email ?? me.user.email,
              addressLine1: profile?.addressLine1 ?? "",
              addressLine2: profile?.addressLine2 ?? "",
              city: profile?.city ?? "",
              state: profile?.state ?? "",
              postalCode: profile?.postalCode ?? "",
              country: profile?.country ?? "",
              gstin: profile?.gstin ?? "",
            }}
          />
        </Card>
      </section>

      <section className="space-y-4">
        <Heading icon={Lock} title="Payment method" />
        <Card className="p-6 text-[15px] leading-relaxed text-stone-600">
          {online ? (
            <p>Payments go through Razorpay: cards, UPI, net banking and wallets. You choose how to pay each time at checkout. Invytra never sees or stores your card details.</p>
          ) : (
            <p>Online payment isn't switched on yet. When you buy credits, the order is saved here and our team contacts you to complete it; the credits are added as soon as it's paid.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
