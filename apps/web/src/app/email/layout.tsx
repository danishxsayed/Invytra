import { creditsHref } from "@/lib/workspace-nav";
import { LayoutGrid } from "lucide-react";
import { EmailNav } from "@/components/email/EmailNav";
import { ChannelLogo } from "@/components/ChannelLogo";
import { prisma } from "@invytra/db";
import { requireChannel } from "@/lib/auth";
import { inboxCounts } from "@/lib/email-inbox";
import { CreditsChip } from "@/components/credits/CreditsChip";
import { getAiBalance } from "@/lib/ai-credits";
import { hubHref } from "@/lib/domains";

/** Email Outreach: its own tool on the platform, with a link back to every channel. */
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const me = await requireChannel("email");
  const [{ needs }, ai] = await Promise.all([inboxCounts(prisma, me.workspace.id), getAiBalance(prisma, me.workspace.id)]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <ChannelLogo id="email" size="sm" />
            <span className="text-[17px] font-semibold tracking-tight text-stone-900">Email Outreach</span>
            <span className="hidden truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-[13px] font-medium text-stone-600 sm:inline">{me.workspace.name}</span>
          </div>
          <EmailNav needsReply={needs} />
          <CreditsChip left={ai.left} href={creditsHref(me)} compact className="ml-auto" />
          <a href={hubHref("/")} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[14px] font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50">
            <LayoutGrid className="h-4 w-4 text-stone-400" aria-hidden /> All channels
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
