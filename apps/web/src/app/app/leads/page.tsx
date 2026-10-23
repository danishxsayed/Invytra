import { prisma } from "@invytra/db";
import { ChevronRight, ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { NewListButton } from "@/components/LeadListButtons";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { listSummaries } from "@/lib/leads";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const me = await requireUser();
  const lists = await listSummaries(prisma, me.workspace.id);
  const now = new Date();

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Lead lists" description="The people you want to reach — from a CSV file or pasted LinkedIn links." action={<NewListButton />} />

      {lists.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="Create your first lead list"
            body="Upload a CSV from Sales Navigator, Apollo or Excel, or paste LinkedIn profile links. You'll see exactly what will be added before anything is saved."
            action={<NewListButton label="New lead list" />}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-stone-100 overflow-hidden">
          {lists.map((l) => {
            const pct = l.total ? Math.round((l.contacted / l.total) * 100) : 0;
            return (
              <Link key={l.id} href={`/app/leads/${l.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-stone-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                  <ListChecks className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-stone-900">{l.name}</p>
                  <p className="text-[14px] text-stone-500">
                    {l.total.toLocaleString()} {l.total === 1 ? "lead" : "leads"} · created {timeAgo(l.createdAt, now)}
                  </p>
                </div>
                <div className="hidden w-48 sm:block">
                  <div className="flex justify-between text-[14px]">
                    <span className="text-stone-500">Contacted</span>
                    <span className="font-medium text-stone-800">
                      {l.contacted.toLocaleString()}
                      <span className="text-stone-400">/{l.total.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-stone-300 transition group-hover:text-stone-500" aria-hidden />
              </Link>
            );
          })}
        </Card>
      )}

      <div className="flex gap-3 rounded-2xl border border-stone-200/80 bg-white/60 px-5 py-4 text-[15px] text-stone-600">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <p>
          Lists only hold profile links and the details from your file — nothing is sent to LinkedIn until you start a campaign. The same person
          can be in several lists; campaigns will skip anyone your accounts have already contacted.
        </p>
      </div>
    </div>
  );
}
