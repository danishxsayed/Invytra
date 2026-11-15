import { prisma } from "@invytra/db";
import { redirect } from "next/navigation";
import { btn } from "@/components/btn";
import { Card, EmptyState } from "@/components/ui";
import { CampaignBuilder } from "@/components/whatsapp/campaigns/CampaignBuilder";
import { FileText } from "lucide-react";
import { requireChannel } from "@/lib/auth";
import { getNumber } from "@/lib/whatsapp";
import { waContactSummary } from "@/lib/whatsapp-contacts";

export const metadata = { title: "New WhatsApp campaign" };
export const dynamic = "force-dynamic";

export default async function NewWaCampaignPage() {
  const me = await requireChannel("whatsapp");
  const ws = me.workspace.id;
  const n = await getNumber(prisma, ws);
  if (!n) redirect("/whatsapp/number");
  const [templates, summary, keys] = await Promise.all([
    prisma.whatsappTemplate.findMany({ where: { workspaceId: ws, status: "APPROVED", category: { not: "AUTHENTICATION" } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, language: true, category: true, components: true } }),
    waContactSummary(prisma, ws),
    prisma.$queryRaw<{ k: string }[]>`SELECT DISTINCT jsonb_object_keys(vars) AS k FROM whatsapp_contacts WHERE workspace_id = ${ws} AND jsonb_typeof(vars) = 'object' LIMIT 50`,
  ]);
  if (!templates.length)
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="No approved template yet"
          body="A campaign sends a template Meta has approved. Create one and it's usually approved within minutes."
          action={
            <a href="/whatsapp/templates/new" className={btn.primary}>
              New template
            </a>
          }
        />
      </Card>
    );
  return <CampaignBuilder templates={templates} tags={summary.tags} customKeys={keys.map((x) => x.k).sort()} business={n.verifiedName} />;
}
