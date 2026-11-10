import { prisma } from "@invytra/db";
import { ArrowLeft, Download } from "lucide-react";
import { SavedList } from "@/components/invy/SavedList";
import { requireUser } from "@/lib/auth";
import { hubHref } from "@/lib/domains";
import { listSaved } from "@/lib/invy";

export const metadata = { title: "Saved businesses" };
export const dynamic = "force-dynamic";

/** Businesses saved from Ask Invy (later searches skip them). */
export default async function SavedBusinessesPage() {
  const me = await requireUser();
  const rows = await listSaved(prisma, me.workspace.id);
  return (
    <div className="space-y-6">
      <a href={hubHref("/invy")} className="inline-flex items-center gap-1 text-[14px] font-medium text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Ask Invy
      </a>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-stone-900">Saved businesses</h1>
          <p className="mt-1 text-[15px] text-stone-500">Businesses you added from Ask Invy. New searches skip them, so you never see the same one twice.</p>
        </div>
        {rows.length > 0 && (
          <a href="/api/invy/saved/csv" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14px] font-semibold text-stone-700 hover:border-stone-300">
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
        )}
      </div>
      <SavedList
        rows={rows.map((r) => ({ id: r.id, name: r.name, category: r.category, address: r.address, phone: r.phone, email: r.email, website: r.website, mapsUrl: r.mapsUrl, opportunity: r.opportunity, emailed: !!r.emailedAt }))}
        searchHref={hubHref("/invy")}
      />
    </div>
  );
}
