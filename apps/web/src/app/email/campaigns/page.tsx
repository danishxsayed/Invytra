import { prisma } from "@invytra/db";
import { Send } from "lucide-react";
import { NewCampaignButton } from "@/components/email/campaign/NewCampaignButton";
import { CAMPAIGN_STATUS, pct } from "@/components/email/campaign/status";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { listEmailCampaigns } from "@/lib/email-campaigns";

export const metadata = { title: "Email campaigns" };
export const dynamic = "force-dynamic";

export default async function EmailCampaignsPage() {
  const me = await requireChannel("email");
  const rows = await listEmailCampaigns(prisma, me.workspace.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns" description="A list of leads, a sequence of emails and the mailboxes that send them. Follow-ups stop as soon as someone replies." action={<NewCampaignButton />} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Send} title="No campaigns yet" body="Create a campaign, upload a CSV of leads with their email addresses, write your emails and choose which mailboxes send them." />
        </Card>
      ) : (
        <Card>
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-stone-100 text-[13px] text-stone-500">
              <tr>
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-3 py-3 font-medium">Leads</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="px-3 py-3 font-medium">Replied</th>
                <th className="hidden px-3 py-3 font-medium sm:table-cell">Bounced</th>
                <th className="hidden px-3 py-3 font-medium sm:table-cell">Mailboxes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => {
                const s = CAMPAIGN_STATUS[r.status]!;
                return (
                  <tr key={r.id} className="hover:bg-stone-50/60">
                    <td className="px-5 py-3">
                      <a href={`/email/campaigns/${r.id}`} className="font-semibold text-stone-900 hover:underline">
                        {r.name}
                      </a>
                      <span className={cx("ml-2 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1", s.cls)}>{s.text}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.stats.leads}</td>
                    <td className="px-3 py-3 tabular-nums">{r.stats.sent}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.stats.replied} <span className="text-stone-400">({pct(r.stats.replied, r.stats.contacted)})</span>
                    </td>
                    <td className="hidden px-3 py-3 tabular-nums sm:table-cell">{r.stats.bounced}</td>
                    <td className="hidden px-3 py-3 tabular-nums sm:table-cell">{r.mailboxes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
