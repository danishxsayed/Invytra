import { prisma } from "@invytra/db";
import { ENDED_MESSAGE, EXPIRED_MESSAGE, effectiveStatus } from "@invytra/shared";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { hubHref } from "@/lib/domains";

const DAY = 86_400_000;
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The plan's state at the top of every page: trial or plan ended (sending is off), a renewal
 * payment that failed, a plan about to end, the last days of the trial.
 */
export async function PlanBanner({ workspaceId, owner }: { workspaceId: string; owner: boolean }) {
  const s = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!s) return null;
  const now = new Date();
  const status = effectiveStatus(s, now);
  const upgrade = (label: string) =>
    owner ? (
      <a href={hubHref("/billing#plans")} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-stone-800">
        {label} <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
    ) : (
      <span className="text-[14px] text-stone-600">Ask your workspace owner to choose a plan.</span>
    );

  if (status === "EXPIRED")
    return (
      <div role="alert" className="border-b border-rose-200 bg-rose-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
          <p className="min-w-0 flex-1 text-[15px] font-medium text-rose-900">
            {s.plan === "trial" ? EXPIRED_MESSAGE : ENDED_MESSAGE} <span className="font-normal text-rose-800">Your campaigns, contacts and results are all still here.</span>
          </p>
          {upgrade("Upgrade plan")}
        </div>
      </div>
    );
  if (status === "PAST_DUE")
    return (
      <div role="status" className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <p className="min-w-0 flex-1 text-[15px] text-amber-900">
            Your last renewal payment didn't go through. We'll try again over the next few days; if it keeps failing, sending stops. Check the card with your bank.
          </p>
          {owner && (
            <a href={hubHref("/billing")} className="shrink-0 text-[14px] font-semibold text-amber-900 underline underline-offset-2">
              Billing
            </a>
          )}
        </div>
      </div>
    );
  const daysLeft = (end: Date | null) => (end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null);
  if (status === "CANCELLED" && s.currentPeriodEnd)
    return (
      <div role="status" className="border-b border-stone-200 bg-stone-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Clock className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-stone-700">Your plan ends on {day(s.currentPeriodEnd)}. After that, campaigns stop sending.</p>
          {upgrade("Choose a plan")}
        </div>
      </div>
    );
  const left = daysLeft(s.trialEndsAt);
  if (status === "TRIALING" && left !== null && left <= 3)
    return (
      <div role="status" className="border-b border-sky-200 bg-sky-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Clock className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-sky-900">
            Your free trial ends {left <= 1 ? "today" : `in ${left} days`}. Upgrade to keep your campaigns sending.
          </p>
          {upgrade("See plans")}
        </div>
      </div>
    );
  return null;
}
