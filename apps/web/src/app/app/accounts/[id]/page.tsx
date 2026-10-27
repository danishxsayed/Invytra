import { prisma } from "@invytra/db";
import { DEFAULT_LIMITS, MAX_LIMITS } from "@invytra/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountPanel } from "@/components/AccountPanel";
import { SettingsForm } from "@/components/SettingsForm";
import { PageHeader } from "@/components/ui";
import { proxyRequired } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { accountsOverview } from "@/lib/data";
import { allTimeZones } from "@/lib/timezones";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  // Scoped to the signed-in workspace: another workspace's id simply isn't found.
  const [a] = await accountsOverview(prisma, me.workspace.id, id);
  if (!a) notFound();

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link href="/app/accounts" className="inline-flex items-center gap-1 text-[15px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All accounts
        </Link>
        <div className="mt-2">
          <PageHeader title={a.label} description="Health, limits, working hours and proxy for this LinkedIn account." />
        </div>
      </div>
      <AccountPanel a={a} />
      <SettingsForm
        key={`${a.id}-${a.label}`}
        id={a.id}
        zones={allTimeZones()}
        proxyRequired={proxyRequired()}
        defaults={DEFAULT_LIMITS}
        max={MAX_LIMITS}
        initial={{
          label: a.label,
          timezone: a.timezone,
          limits: a.settings,
          workingHours: a.workingHours,
          warmup: a.warmupDay !== null,
          proxy: a.proxy,
          plan: { detected: a.premiumDetected, override: a.premiumOverride, checkedAt: a.premiumCheckedAt?.toISOString() ?? null },
        }}
      />
    </div>
  );
}
