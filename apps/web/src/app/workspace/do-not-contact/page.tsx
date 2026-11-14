import { prisma } from "@invytra/db";
import { DNC_KINDS, DNC_KIND_LABEL, type DncKind } from "@invytra/shared";
import { Ban, Download, Search } from "lucide-react";
import { AddDnc } from "@/components/dnc/AddDnc";
import { DncTable } from "@/components/dnc/DncTable";
import { btn } from "@/components/btn";
import { Card, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DNC_PAGE, listDnc } from "@/lib/do-not-contact";
import { hubHref } from "@/lib/domains";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Do-not-contact list" };
export const dynamic = "force-dynamic";

/** People, domains and companies no channel ever contacts. */
export default async function DoNotContactPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; page?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const kind = (DNC_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as DncKind) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows, byKind } = await listDnc(prisma, me.workspace.id, { q: sp.q, kind, page });
  const all = Object.values(byKind).reduce((a, b) => a + (b ?? 0), 0);
  const href = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, kind, ...p })) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString();
    return hubHref(`/do-not-contact${s ? `?${s}` : ""}`);
  };
  const pages = Math.max(1, Math.ceil(total / DNC_PAGE));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-[28px] font-semibold tracking-tight text-stone-900">
          <Ban className="h-6 w-6 text-rose-600" aria-hidden /> Do-not-contact list
        </h1>
        <p className="mt-1 max-w-2xl text-[15px] text-stone-500">
          Nobody here is ever contacted, on any channel: LinkedIn campaigns skip them and email campaigns don't send to them. Adding someone also stops them in campaigns that are already running.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="text-[17px] font-semibold text-stone-900">Add to the list</h2>
        <p className="mb-3 mt-0.5 text-[14px] text-stone-500">LinkedIn profile links, email addresses, whole domains (blocks every address at that company) or company names.</p>
        <AddDnc />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-3.5">
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter by type">
            {[{ k: undefined, label: "All", n: all }, ...DNC_KINDS.map((k) => ({ k, label: DNC_KIND_LABEL[k], n: byKind[k] ?? 0 }))].map((f) => (
              <a key={f.label} href={href({ kind: f.k, page: undefined })} className={cx("rounded-full border px-3 py-1 text-[13px] transition", kind === f.k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300")}>
                {f.label} <span className={kind === f.k ? "text-white/70" : "text-stone-400"}>{f.n}</span>
              </a>
            ))}
          </nav>
          <form action={hubHref("/do-not-contact")} className="ml-auto flex items-center gap-2">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search" aria-label="Search the list" className="w-48 rounded-lg border border-stone-300 py-1.5 pl-8 pr-3 text-[14px] focus:border-stone-500 focus:outline-none" />
            </label>
            <a href={hubHref("/do-not-contact/export")} className={cx(btn.secondary, "shrink-0 whitespace-nowrap")}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
          </form>
        </div>
        {rows.length ? (
          <DncTable rows={rows.map((r) => ({ id: r.id, kind: DNC_KIND_LABEL[r.kind as DncKind], label: r.label, note: r.note, added: timeAgo(r.createdAt) }))} />
        ) : (
          <p className="px-5 py-10 text-center text-[15px] text-stone-500">{all ? "Nothing matches." : "The list is empty. Add customers, competitors, partners or anyone who asked not to be contacted."}</p>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[14px] text-stone-600">
            <span>
              Page {page} of {pages} · {total.toLocaleString("en-US")} entries
            </span>
            <span className="flex gap-2">
              {page > 1 && <a className={btn.secondary} href={href({ page: page - 1 })}>Previous</a>}
              {page < pages && <a className={btn.secondary} href={href({ page: page + 1 })}>Next</a>}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
