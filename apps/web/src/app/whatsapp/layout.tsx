import { prisma } from "@invytra/db";
import { LayoutGrid } from "lucide-react";
import { PlanBanner } from "@/components/billing/PlanBanner";
import { ChannelLogo } from "@/components/ChannelLogo";
import { CreditsChip } from "@/components/credits/CreditsChip";
import { WhatsappNav } from "@/components/whatsapp/WhatsappNav";
import { getAiBalance } from "@/lib/ai-credits";
import { requireChannel } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { creditsHref } from "@/lib/workspace-nav";

/** WhatsApp: its own tool on the platform (official Cloud API), with a link back to every channel. */
export default async function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("whatsapp");
  const ai = await getAiBalance(prisma, me.workspace.id);
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <ChannelLogo id="whatsapp" size="sm" />
            <span className="text-[17px] font-semibold tracking-tight text-stone-900">WhatsApp</span>
            <span className="hidden truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium text-stone-600 sm:inline">{me.workspace.name}</span>
          </div>
          <WhatsappNav />
          <CreditsChip left={ai.left} href={creditsHref(me)} compact className="ml-auto" />
          <a href={hubHref("/")} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[14px] font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50">
            <LayoutGrid className="h-4 w-4 text-stone-400" aria-hidden /> All channels
          </a>
        </div>
      </header>
      <PlanBanner workspaceId={me.workspace.id} owner={me.role === "OWNER"} />
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
