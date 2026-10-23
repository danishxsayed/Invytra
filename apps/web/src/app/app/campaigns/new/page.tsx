import { prisma } from "@invytra/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CampaignBuilder } from "@/components/campaign/CampaignBuilder";
import { requireUser } from "@/lib/auth";
import { builderOptions } from "@/lib/campaigns";

export const metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const me = await requireUser();
  const options = await builderOptions(prisma, me.workspace.id);
  const { list } = await searchParams;
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link href="/app/campaigns" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Campaigns
        </Link>
        <h1 className="mt-3 text-[34px] font-semibold tracking-tight text-stone-900">New campaign</h1>
      </div>
      <CampaignBuilder options={options} presetListId={options.lists.some((l) => l.id === list) ? list : undefined} />
    </div>
  );
}
