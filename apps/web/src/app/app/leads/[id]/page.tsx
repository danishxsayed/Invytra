import { prisma } from "@invytra/db";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, UserRoundSearch } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListActions } from "@/components/LeadListButtons";
import { LeadTable } from "@/components/LeadTable";
import { Card, EmptyState, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ImportProgress } from "@/components/ImportProgress";
import { timeAgo } from "@/lib/format";
import { IMPORT_REASON, importAccounts, importWaits, importsForList } from "@/lib/imports";
import { LeadListNotFoundError, getList, leadsPage, listSummaries } from "@/lib/leads";

export const metadata = { title: "Lead list" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeadListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let list;
  try {
    list = await getList(prisma, me.workspace.id, id);
  } catch (e) {
    if (e instanceof LeadListNotFoundError) notFound();
    throw e;
  }
  const [{ total, rows }, summaries, accounts, imports] = await Promise.all([
    leadsPage(prisma, me.workspace.id, id, { q, page, pageSize: PAGE_SIZE }),
    listSummaries(prisma, me.workspace.id),
    importAccounts(prisma, me.workspace.id),
    importsForList(prisma, me.workspace.id, id),
  ]);
  const now = new Date();
  const waits = await importWaits(prisma, imports, now);
  const importViews = imports
    .filter((i) => i.status === "RUNNING" || (i.finishedAt && now.getTime() - i.finishedAt.getTime() < 7 * 86400_000))
    .map((i) => ({
      id: i.id,
      kind: i.kind,
      url: i.url,
      status: i.status,
      maxLeads: i.maxLeads,
      pages: i.pages,
      found: i.found,
      added: i.added,
      reasonText: i.reason ? (IMPORT_REASON[i.reason] ?? i.reason) : null,
      accountLabel: i.account.label,
      accountActive: i.account.status === "ACTIVE",
      waiting: waits.get(i.id) ?? null,
      when: `started ${timeAgo(i.createdAt, now)}`,
    }));
  const summary = summaries.find((s) => s.id === id);
  const listTotal = summary?.total ?? total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/app/leads/${id}?${new URLSearchParams({ ...(q && { q }), ...(p > 1 && { page: String(p) }) })}`;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link href="/app/leads" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All lists
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[34px] font-semibold tracking-tight text-stone-900">{list.name}</h1>
            <p className="mt-1 text-[16px] text-stone-500">
              {listTotal.toLocaleString()} {listTotal === 1 ? "lead" : "leads"} · {(summary?.contacted ?? 0).toLocaleString()} contacted
            </p>
          </div>
          <ListActions id={list.id} name={list.name} total={listTotal} accounts={accounts} />
        </div>
      </div>

      <ImportProgress listId={list.id} imports={importViews} />

      <Card className="overflow-hidden">
        <form className="flex items-center gap-2 border-b border-stone-100 px-5 py-3" action={`/app/leads/${id}`}>
          <Search className="h-4 w-4 text-stone-400" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, company, title…"
            aria-label="Search leads"
            className="w-full bg-transparent text-[15px] text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
          {q && (
            <Link href={`/app/leads/${id}`} className="text-[14px] font-medium text-stone-500 hover:text-stone-900">
              Clear
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={UserRoundSearch}
            title={q ? "No leads match your search" : "This list is empty"}
            body={q ? "Try a different name, company or title." : "Add leads from a CSV file or paste LinkedIn profile links."}
          />
        ) : (
          <LeadTable
            listId={id}
            rows={rows.map((r) => ({
              ...r,
              createdAt: r.createdAt.toISOString(),
              status: { ...r.status, at: r.status.at?.toISOString() ?? null },
            }))}
          />
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[14px] text-stone-500">
            <span>
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <PageLink href={href(page - 1)} disabled={page <= 1} label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </PageLink>
              <PageLink href={href(page + 1)} disabled={page >= pages} label="Next page">
                <ChevronRight className="h-4 w-4" />
              </PageLink>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200";
  if (disabled) return <span className={cx(cls, "text-stone-300")} aria-hidden>{children}</span>;
  return (
    <Link href={href} aria-label={label} className={cx(cls, "text-stone-600 hover:bg-stone-50")}>
      {children}
    </Link>
  );
}
