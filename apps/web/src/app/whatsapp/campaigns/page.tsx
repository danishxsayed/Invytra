import { prisma } from "@invytra/db";
import { Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { btn } from "@/components/btn";
import { LocalTime } from "@/components/LocalTime";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CampaignStatus, Funnel } from "@/components/whatsapp/campaigns/bits";
import { requireChannel } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { listWaCampaigns } from "@/lib/whatsapp-campaigns";

export const metadata = { title: "WhatsApp campaigns" };
export const dynamic = "force-dynamic";

const when = (c: { status: string; scheduledAt: Date | null; startedAt: Date | null; finishedAt: Date | null }, now: Date): React.ReactNode =>
  c.status === "SCHEDULED" && c.scheduledAt && c.scheduledAt > now ? (
    <>
      Starts <LocalTime iso={c.scheduledAt.toISOString()} />
    </>
  ) : c.finishedAt
      ? `Ended ${timeAgo(c.finishedAt, now)}`
      : c.startedAt
        ? `Started ${timeAgo(c.startedAt, now)}`
        : "Starting within a minute";

export default async function WaCampaignsPage() {
  const me = await requireChannel("whatsapp");
  const list = await listWaCampaigns(prisma, me.workspace.id);
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Send an approved template to your contacts by tag, with each person's details filled in."
        action={
          <a href="/whatsapp/campaigns/new" className={btn.primary}>
            <Plus className="h-4 w-4" aria-hidden /> New campaign
          </a>
        }
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="No campaigns yet" body="Pick an approved template and a tag of contacts. Invytra sends in batches within your number's daily limit." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/whatsapp/campaigns/${c.id}`} className="block rounded-2xl bg-white p-5 ring-1 ring-stone-200 transition hover:ring-stone-300">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[16.5px] font-semibold text-stone-900">{c.name}</span>
                  <CampaignStatus status={c.status} />
                  <span className="ml-auto text-[13px] text-stone-500">{when(c, now)}</span>
                </div>
                <p className="mt-0.5 text-[13.5px] text-stone-500">
                  <span className="font-mono">{c.templateName}</span> · {c.segmentName ? `segment: ${c.segmentName}` : c.tags.length ? c.tags.map((t) => `#${t}`).join(" ") : "everyone subscribed"}
                  {c.note && <span className="text-amber-700"> · {c.note}</span>}
                </p>
                <div className="mt-4">
                  <Funnel s={c.stats} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
