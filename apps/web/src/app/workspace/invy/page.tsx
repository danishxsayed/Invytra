import { prisma } from "@invytra/db";
import { Bookmark, ChevronRight, Sparkles } from "lucide-react";
import { AskBox } from "@/components/invy/AskBox";
import { SearchHistory } from "@/components/invy/SearchHistory";
import { getAiBalance } from "@/lib/ai-credits";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";
import { listSearches } from "@/lib/invy";

export const metadata = { title: "Ask Invy" };
export const dynamic = "force-dynamic";

/** Ask Invy: describe the businesses to find; earlier searches and saved businesses below. */
export default async function AskInvyPage() {
  const me = await requireUser();
  const [searches, ai, saved] = await Promise.all([
    listSearches(prisma, me.workspace.id),
    getAiBalance(prisma, me.workspace.id),
    prisma.invyProspect.count({ where: { workspaceId: me.workspace.id } }),
  ]);
  const base = hubHref("/invy");
  return (
    <div className="space-y-8">
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-2.5 py-1 text-[12px] font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask Invy
        </p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-tight text-stone-900">Who should you reach next?</h1>
        <p className="mt-1 max-w-2xl text-[16px] text-stone-500">
          Describe the businesses you want. Invy searches Google Maps, opens their websites to check, and shows you the ones that fit, on a map, with why.
        </p>
      </div>
      <AskBox base={base} credits={ai.left} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">Your searches</h2>
          <a href={`${base}/saved`} className="inline-flex items-center gap-1 text-[14px] font-medium text-stone-600 hover:text-stone-900">
            <Bookmark className="h-4 w-4" aria-hidden /> Saved businesses ({saved}) <ChevronRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <SearchHistory base={base} rows={searches.map((r) => ({ id: r.id, title: r.title, status: r.status, found: r.found, when: timeAgo(r.updatedAt) }))} />
      </section>
    </div>
  );
}
