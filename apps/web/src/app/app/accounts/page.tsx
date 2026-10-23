import { prisma } from "@invytra/db";
import { ShieldCheck, Users } from "lucide-react";
import { Suspense } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { AddAccountButton } from "@/components/AddAccountButton";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { proxyRequired } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import { accountsOverview } from "@/lib/data";
import { allTimeZones } from "@/lib/timezones";

export const metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const me = await requireUser();
  const accounts = await accountsOverview(prisma, me.workspace.id);
  const add = (
    <Suspense>
      <AddAccountButton zones={allTimeZones()} proxyRequired={proxyRequired()} />
    </Suspense>
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="LinkedIn accounts"
        description="Each account runs in its own browser, through its own proxy, within safe daily limits."
        action={add}
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Connect your first LinkedIn account"
            body="Add an account, then log in to LinkedIn in a secure window. Invytra keeps the session — never your password."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => (
            <AccountPanel key={a.id} a={a} />
          ))}
        </div>
      )}

      <div className="flex gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-5 py-4 text-[15px] text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-semibold">Safe mode is always on</p>
          <p className="text-emerald-800/90">
            Daily totals vary a little each day, new accounts warm up gradually, actions only run in working hours with
            human-like gaps, and anything unusual on LinkedIn stops the account until you check it.
          </p>
        </div>
      </div>
    </div>
  );
}
