import { prisma } from "@invytra/db";
import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
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
  const accounts = new Set(rows.map((r) => r.account.label));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-ink-soft">Every visit, invite, message and inbox check — newest first.</p>
      </header>
      <nav aria-label="Filter activity" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/app/activity" : `/app/activity?show=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${
              f.key === filter.key ? "bg-ink text-white" : "bg-white text-ink-soft shadow-[0_0_0_1px_theme(colors.line)] hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <section className="rounded-lg border border-line bg-white px-5">
        <ActivityList rows={rows} showAccount={accounts.size > 1} />
      </section>
    </div>
  );
}
