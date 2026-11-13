import { prisma, razorpayKeys } from "@invytra/db";
import { PLAN_CHANNELS, SENDER_LABEL, channelById, formatMoney, type PlanChoice } from "@invytra/shared";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, FileText, History, Lock, ReceiptText, Sparkles } from "lucide-react";
import { AiCredits } from "@/components/credits/AiCredits";
import { BillingDetails } from "@/components/billing/BillingDetails";
import { PlanActions } from "@/components/billing/PlanActions";
import { PlanCards, PlanCompare } from "@/components/billing/PlanCards";
import { VerifyCredits } from "@/components/email/contacts/VerifyCredits";
import { Card, cx } from "@/components/ui";
import { aiUsageThisMonth, getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { listPayments } from "@/lib/billing";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { SITE } from "@/lib/site";
import { planView, subscriptionHistory } from "@/lib/subscriptions";
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
  const [plan, ai, usage, aiOrders, verify, verifyOrders, payments, profile, history] = await Promise.all([
    planView(prisma, ws),
    getAiBalance(prisma, ws),
    aiUsageThisMonth(prisma, ws),
    listVerifyOrders(prisma, ws, "AI"),
    getVerifyBalance(prisma, ws),
    listVerifyOrders(prisma, ws, "VERIFY"),
    listPayments(prisma, ws),
    prisma.billingProfile.findUnique({ where: { workspaceId: ws } }),
    subscriptionHistory(prisma, ws),
  ]);
  const trial = plan.plan === "trial";
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
        <Heading icon={CreditCard} title="Your plan" />
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[24px] font-semibold text-stone-900">{plan.name}</p>
                <StatusPill status={plan.status} trial={trial} daysLeft={plan.trialEndsAt ? Math.max(0, Math.ceil((plan.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null} />
                {plan.cycle && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium capitalize text-stone-600">{plan.cycle}</span>}
              </div>
              <p className="mt-1 text-[15px] text-stone-600">
                {trial && plan.trialEndsAt
                  ? `Free trial ${plan.status === "EXPIRED" ? "ended" : "ends"} ${day(plan.trialEndsAt)}.`
                  : plan.status === "EXPIRED"
                    ? "This plan has ended."
                    : plan.cancelAtPeriodEnd && plan.periodEnd
                      ? `Cancelled: runs until ${day(plan.periodEnd)}.`
                      : plan.periodEnd
                        ? `${formatMoney(plan.priceCents)} a ${plan.cycle === "yearly" ? "year" : "month"}, renews ${day(plan.periodEnd)}.`
                        : "Your current plan."}
                {plan.status !== "EXPIRED" && ` ${plan.credits} credits a month.`}
              </p>
            </div>
            {!trial && plan.renewsAutomatically && <PlanActions canCancel={!plan.cancelAtPeriodEnd && plan.status !== "EXPIRED"} pending={!!plan.pending} endsOn={plan.periodEnd ? day(plan.periodEnd) : null} />}
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            {PLAN_CHANNELS.map((c) => {
              const inPlan = plan.channels.includes(c);
              const ch = channelById(c);
              return (
                <div key={c} className={cx("rounded-xl border px-4 py-3", inPlan ? "border-stone-200" : "border-dashed border-stone-200 bg-stone-50")}>
                  <dt className="flex items-center gap-1.5 text-[14px] font-medium text-stone-900">
                    {inPlan ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <Lock className="h-4 w-4 text-stone-400" aria-hidden />}
                    {ch?.name ?? c}
                    {ch?.status !== "live" && <span className="rounded-full bg-sky-100 px-1.5 text-[11px] font-semibold text-sky-800">soon</span>}
                  </dt>
                  <dd className={cx("mt-1 text-[13.5px]", inPlan && plan.used[c] > plan.limits[c] ? "text-amber-700" : "text-stone-500")}>
                    {!inPlan
                      ? "Locked: not in your plan"
                      : plan.used[c] > plan.limits[c]
                        ? `${plan.used[c]} connected; the plan allows ${plan.limits[c]}`
                        : `${plan.used[c]} of ${plan.limits[c]} ${plan.limits[c] === 1 ? SENDER_LABEL[c].one : SENDER_LABEL[c].many} in use`}
                  </dd>
                </div>
              );
            })}
          </dl>

          {plan.paymentFailed && plan.status !== "EXPIRED" && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The last renewal payment didn&apos;t go through. Razorpay retries it over the next few days; check the card with your bank.
            </p>
          )}
          {plan.pending && (
            <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-[14px] text-sky-900">
              From {day(new Date(plan.pending.at))}: {describe(plan.pending.choice)}, {formatMoney(plan.pending.priceCents)} a {plan.pending.choice.cycle === "yearly" ? "year" : "month"}.
            </p>
          )}
          {plan.status === "EXPIRED" && (
            <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900">
              Sending is off: campaigns are paused and new ones can&apos;t start. Everything you made is still here. Choose a plan below to carry on.
            </p>
          )}
        </Card>
      </section>

      {plan.plan === "vip" && plan.status !== "EXPIRED" ? (
        <section className="space-y-4">
          <Heading id="plans" icon={Sparkles} title="Custom VIP plan" />
          <Card className="p-6 text-[15px] text-stone-600">
            Your plan was set up with our team. To change channels, senders or credits, write to{" "}
            <a href={`mailto:${SITE.email}`} className="font-medium text-stone-900 underline">
              {SITE.email}
            </a>
            .
          </Card>
        </section>
      ) : (
        <section className="space-y-4">
          <Heading
            id="plans"
            icon={Sparkles}
            title={trial || plan.status === "EXPIRED" ? "Choose a plan" : "Change your plan"}
            hint={trial || plan.status === "EXPIRED" || plan.cancelAtPeriodEnd ? "Pay by card; plans renew automatically. Cancel any time." : "More senders or a bigger plan apply now (you pay the difference for the days left). Less applies from your next renewal."}
          />
          <PlanCards
            mode="app"
            contactHref={`mailto:${SITE.email}?subject=${encodeURIComponent(`Invytra custom VIP plan (${me.workspace.name})`)}`}
            whatsappLive={channelById("whatsapp")?.status === "live"}
            current={{ plan: plan.plan, cycle: plan.cycle, channels: plan.channels, extra: plan.extra, canSubscribe: trial || plan.status === "EXPIRED" || plan.cancelAtPeriodEnd || !plan.renewsAutomatically, ended: plan.status === "EXPIRED" }}
          />
          <details className="group rounded-2xl">
            <summary className="cursor-pointer text-[14px] font-medium text-stone-600 hover:text-stone-900">Compare plans</summary>
            <div className="mt-3">
              <PlanCompare />
            </div>
          </details>
        </section>
      )}

      <section className="space-y-4">
        <Heading id="credits" icon={Sparkles} title="Credits and usage" hint="Monthly credits come with your plan; extra packs never expire." />
        <AiCredits c={{ ...ai, resetsOn: shortDay(ai.resetsAt), trial, usage, orders: orders(aiOrders) }} />
        <VerifyCredits c={{ ...verify, resetsOn: shortDay(verify.resetsAt), trial, orders: orders(verifyOrders) }} />
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
        <Heading icon={History} title="Plan history" hint="Every change to your plan, payment and renewal." />
        <Card className="overflow-hidden">
          {history.length ? (
            <ol className="divide-y divide-stone-100">
              {history.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-[14.5px]">
                  <span className="text-stone-800">{eventText(e.kind, e.detail as Record<string, unknown> | null)}</span>
                  <span className="text-[13px] text-stone-500">{day(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-[15px] text-stone-500">Nothing yet.</p>
          )}
        </Card>
      </section>

      <section className="space-y-4">
        <Heading icon={Lock} title="Payment method" />
        <Card className="p-6 text-[15px] leading-relaxed text-stone-600">
          {online ? (
            <p>Payments go through Razorpay. Plans are paid by card in US dollars and renew automatically; credit packs can also be paid with UPI or net banking. Invytra never sees or stores your card details.</p>
          ) : (
            <p>Online payment isn't switched on yet. When you buy credits, the order is saved here and our team contacts you to complete it; the credits are added as soon as it's paid.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

const describe = (c: PlanChoice) => {
  const extras = PLAN_CHANNELS.filter((ch) => c.extra[ch]).map((ch) => `+${c.extra[ch]} ${c.extra[ch] === 1 ? SENDER_LABEL[ch].one : SENDER_LABEL[ch].many}`);
  return `${c.plan === "growth" ? "Growth" : "Starter"} (${c.channels.map((ch) => channelById(ch)?.name ?? ch).join(", ")}${extras.length ? `; ${extras.join(", ")}` : ""})`;
};

function StatusPill({ status, trial, daysLeft }: { status: string; trial: boolean; daysLeft: number | null }) {
  const look =
    status === "EXPIRED"
      ? { cls: "bg-rose-50 text-rose-800 ring-rose-600/20", text: trial ? "Trial ended" : "Ended", Icon: AlertTriangle }
      : status === "PAST_DUE"
        ? { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", text: "Payment failed", Icon: AlertTriangle }
        : status === "CANCELLED"
          ? { cls: "bg-stone-100 text-stone-700 ring-stone-500/20", text: "Cancelled", Icon: Clock }
          : trial
            ? { cls: "bg-sky-50 text-sky-800 ring-sky-600/20", text: `${daysLeft ?? 0} day${daysLeft === 1 ? "" : "s"} left`, Icon: Clock }
            : { cls: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", text: "Active", Icon: CheckCircle2 };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1", look.cls)}>
      <look.Icon className="h-3.5 w-3.5" aria-hidden /> {look.text}
    </span>
  );
}

function eventText(kind: string, d: Record<string, unknown> | null): string {
  const s = (k: string) => (typeof d?.[k] === "string" ? (d[k] as string) : "");
  const money = (k: string) => (typeof d?.[k] === "number" ? formatMoney(d[k] as number) : "");
  switch (kind) {
    case "trial_started":
      return "Free trial started";
    case "trial_channel":
      return `Trial channel: ${channelById(s("channel"))?.name ?? s("channel")}`;
    case "subscribed":
      return `Subscribed: ${s("plan")}${money("priceCents") ? `, ${money("priceCents")}` : ""}`;
    case "upgraded":
      return `Upgraded to ${s("to")}${money("paidCents") ? ` (paid ${money("paidCents")} for the rest of the period)` : ""}`;
    case "change_scheduled":
      return `Change scheduled for the next renewal: ${s("to")}`;
    case "change_applied":
      return `Plan changed at renewal: ${s("to")}`;
    case "change_dropped":
      return "Scheduled change dropped";
    case "renewed":
      return `Renewed${money("amountCents") ? `: ${money("amountCents")}` : ""}`;
    case "payment_failed":
      return "Renewal payment failed (retrying)";
    case "cancelled":
      return "Plan cancelled (runs to the end of the period)";
    case "expired":
      return `${s("reason") ? s("reason").charAt(0).toUpperCase() + s("reason").slice(1) : "Ended"}: sending stopped`;
    case "trial_extended":
      return "Free trial extended";
    case "vip_set":
      return "Custom VIP plan set up";
    case "renewal_price_not_updated":
      return "Upgrade paid; renewal price update pending (our team will fix it)";
    default:
      return kind.replace(/_/g, " ");
  }
}
