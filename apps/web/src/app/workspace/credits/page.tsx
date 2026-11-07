import { prisma } from "@invytra/db";
import { ArrowLeft } from "lucide-react";
import { AiCredits } from "@/components/credits/AiCredits";
import { LogoMark } from "@/components/LogoMark";
import { VerifyCredits } from "@/components/email/contacts/VerifyCredits";
import { aiUsageThisMonth, getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { getVerifyBalance, listVerifyOrders } from "@/lib/verify-credits";

export const metadata = { title: "Credits" };
export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Credits for the whole workspace: AI credits (every channel) and email verification credits. */
export default async function CreditsPage() {
  const me = await requireUser();
  const ws = me.workspace.id;
  const [ai, usage, aiOrders, verify, verifyOrders] = await Promise.all([getAiBalance(prisma, ws), aiUsageThisMonth(prisma, ws), listVerifyOrders(prisma, ws, "AI"), getVerifyBalance(prisma, ws), listVerifyOrders(prisma, ws, "VERIFY")]);
  const orders = (rows: typeof aiOrders) => rows.map((o) => ({ id: o.id, credits: o.credits, priceCents: o.priceCents, status: o.status as "PENDING" | "PAID", when: timeAgo(o.createdAt) }));
  const trial = me.workspace.plan === "trial";
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href={hubHref("/")} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[14px] font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All channels
          </a>
          <span className="ml-auto flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-[16px] font-semibold text-stone-900">Invytra</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Credits</h1>
          <p className="mt-1 text-[15px] text-stone-500">What's left for {me.workspace.name}, what each feature costs, and buying more.</p>
        </div>
        <AiCredits c={{ ...ai, resetsOn: day(ai.resetsAt), trial, usage, orders: orders(aiOrders) }} />
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-stone-900">Email verification credits</h2>
          <VerifyCredits c={{ ...verify, resetsOn: day(verify.resetsAt), trial, orders: orders(verifyOrders) }} />
        </section>
      </main>
    </div>
  );
}
