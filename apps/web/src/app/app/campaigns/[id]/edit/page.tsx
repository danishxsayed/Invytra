import { prisma } from "@invytra/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignBuilder } from "@/components/campaign/CampaignBuilder";
import { requireChannel } from "@/lib/auth";
import { CampaignNotFoundError, builderOptions, getCampaign } from "@/lib/campaigns";

export const metadata = { title: "Edit campaign" };
export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireChannel("linkedin");
  const { id } = await params;
  let c;
  try {
    c = await getCampaign(prisma, me.workspace.id, id);
  } catch (e) {
    if (e instanceof CampaignNotFoundError) notFound();
    throw e;
  }
  const options = await builderOptions(prisma, me.workspace.id);
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link href={`/app/campaigns/${c.id}`} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {c.name}
        </Link>
        <h1 className="mt-3 text-[34px] font-semibold tracking-tight text-stone-900">Edit campaign</h1>
        {c.status !== "DRAFT" && (
          <p className="mt-1 text-[16px] text-stone-500">
            This campaign has started: you can change texts and waits, and add follow-ups at the end. Changes apply to the next steps people reach.
          </p>
        )}
      </div>
      <CampaignBuilder
        options={options}
        initial={{ id: c.id, name: c.name, accountIds: c.senders.map((a) => a.id), listId: c.listId, steps: c.steps, settings: c.settings, status: c.status }}
      />
    </div>
  );
}
