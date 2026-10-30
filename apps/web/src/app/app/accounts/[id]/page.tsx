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
import { CONNECT_PROBLEM, type ConnectProblem } from "@/lib/unipile";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ connected?: string; connect_error?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const q = await searchParams;
  // Back from Unipile's login page: only known codes are shown, never text from the link.
  const problem = q.connect_error && q.connect_error in CONNECT_PROBLEM ? CONNECT_PROBLEM[q.connect_error as ConnectProblem] : null;
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
      {q.connected === "1" && a.status === "ACTIVE" && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-[15px] font-medium text-emerald-800">
          {a.profileName ?? a.label} is connected. Campaigns can use this account now.
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-[15px] font-medium text-rose-800">
          {problem}
        </p>
      )}
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
        }}
      />
    </div>
  );
}
