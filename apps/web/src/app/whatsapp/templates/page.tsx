import { prisma } from "@invytra/db";
import { Plus } from "lucide-react";
import { btn } from "@/components/btn";
import { PageHeader } from "@/components/ui";
import { TemplateGallery } from "@/components/whatsapp/TemplateGallery";
import { requireChannel } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { getNumber, listTemplates } from "@/lib/whatsapp";

export const metadata = { title: "WhatsApp templates" };
export const dynamic = "force-dynamic";

export default async function WhatsappTemplatesPage() {
  const me = await requireChannel("whatsapp");
  const [n, templates] = await Promise.all([getNumber(prisma, me.workspace.id), listTemplates(prisma, me.workspace.id)]);
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Message templates"
        description="WhatsApp needs a Meta-approved template to start a conversation. Inside the 24 hours after someone replies, you can write freely."
        action={
          n ? (
            <a href="/whatsapp/templates/new" className={btn.primary}>
              <Plus className="h-4 w-4" aria-hidden /> New template
            </a>
          ) : undefined
        }
      />
      {n ? (
        <TemplateGallery
          syncedLabel={n.syncedAt ? `Synced ${timeAgo(n.syncedAt, now)}` : "Not synced yet"}
          templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, rejectedReason: t.rejectedReason, quality: t.quality, components: t.components, updated: timeAgo(t.updatedAt, now) }))}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-[16px] font-medium text-stone-800">Connect your WhatsApp number first</p>
          <p className="mt-1 text-[14px] text-stone-500">Templates belong to your WhatsApp Business account.</p>
          <a href="/whatsapp/number" className={`${btn.primary} mt-5`}>
            Connect number
          </a>
        </div>
      )}
    </div>
  );
}
