import { prisma } from "@invytra/db";
import { waitingToStart } from "@invytra/shared";
import { ChevronRight, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { CampaignStatusBadge } from "@/components/campaign/CampaignBits";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { pct } from "@/lib/campaign-text";
import { listCampaigns } from "@/lib/campaigns";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const newButton = (
  <Link href="/app/campaigns/new" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-400 px-3.5 py-2 text-[15px] font-semibold text-stone-900 shadow-glow transition hover:bg-brand-300">
    <Plus className="h-4 w-4" aria-hidden /> New campaign
  </Link>
);

export default async function CampaignsPage() {
  const me = await requireChannel("linkedin");
  const campaigns = await listCampaigns(prisma, me.workspace.id);

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Campaigns" description="Sequences of visits, invites and messages, sent from one or more of your accounts to a lead list." action={newButton} />
      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Rocket}
            title="Create your first campaign"
            body="Pick an account and a lead list, write your invite note and follow-ups, preview them with real names, and launch."
            action={newButton}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-stone-100 overflow-hidden">
          {campaigns.map((c) => {
            const s = c.stats;
            const total = c.status === "DRAFT" ? c.listSize : s.total;
            const finished = (s.byState.DONE ?? 0) + (s.byState.REPLIED ?? 0) + (s.byState.NOT_ACCEPTED ?? 0) + (s.byState.SKIPPED ?? 0) + (s.byState.FAILED ?? 0);
            return (
              <Link key={c.id} href={`/app/campaigns/${c.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition hover:bg-stone-50 md:flex-nowrap">
                <div className="min-w-0 flex-1 basis-full md:basis-auto">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[16px] font-semibold text-stone-900">{c.name}</p>
                    <CampaignStatusBadge status={c.status === "ACTIVE" && waitingToStart(c.settings, new Date()) ? "SCHEDULED" : c.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[14px] text-stone-500">
                    {c.senders.length === 0 ? "No account" : c.senders.length === 1 ? c.senders[0]!.label : `${c.senders.length} accounts`} → {c.list?.name ?? "No list"} · {total.toLocaleString()} {total === 1 ? "lead" : "leads"}
                  </p>
                </div>
                <Stat label="Invited" value={s.invited} />
                <Stat label="Accepted" value={`${pct(s.accepted, s.invited)}%`} />
                <Stat label="Replied" value={s.replied} />
                <div className="w-full md:w-40">
                  <div className="flex justify-between text-[13px] text-stone-500">
                    <span>Progress</span>
                    <span>{pct(finished, s.total)}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct(finished, s.total)}%` }} />
                  </div>
                </div>
                <ChevronRight className="hidden h-5 w-5 shrink-0 text-stone-300 group-hover:text-stone-500 md:block" aria-hidden />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="w-20 shrink-0">
      <p className="text-[13px] text-stone-500">{label}</p>
      <p className="text-[17px] font-semibold tabular-nums text-stone-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}
