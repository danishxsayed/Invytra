import { prisma } from "@invytra/db";
import { Activity } from "lucide-react";
import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { recentActivity, type ActivityFilter } from "@/lib/data";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; status?: ActivityFilter["status"] }[] = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued", status: "QUEUED" },
  { key: "done", label: "Done", status: "SUCCEEDED" },
  { key: "skipped", label: "Skipped", status: "SKIPPED" },
  { key: "failed", label: "Failed", status: "FAILED" },
];

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const me = await requireUser();
  const show = (await searchParams).show ?? "all";
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0]!;
  const rows = await recentActivity(prisma, me.workspace.id, { status: filter.status, take: 200 });
  const many = new Set(rows.map((r) => r.account.label)).size > 1;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Activity" description="Every visit, invite, message and inbox check — newest first." />
      <nav aria-label="Filter activity" className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-card">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/app/activity" : `/app/activity?show=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              f.key === filter.key ? "bg-brand-400 text-stone-900" : "text-stone-500 hover:text-stone-900",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={filter.key === "all" ? "No activity yet" : `Nothing ${filter.label.toLowerCase()}`}
            body="Actions appear here as soon as the worker runs them."
          />
        ) : (
          <ActivityList rows={rows} showAccount={many} />
        )}
      </Card>
    </div>
  );
}
