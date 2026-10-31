import { prisma } from "@invytra/db";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ActivityList } from "@/components/ActivityList";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireChannel } from "@/lib/auth";
import { activityCount, recentActivity, type ActivityFilter } from "@/lib/data";
import { inboxFilterOptions } from "@/lib/inbox";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES: { key: string; label: string; status?: ActivityFilter["status"] }[] = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued", status: "QUEUED" },
  { key: "done", label: "Done", status: "SUCCEEDED" },
  { key: "skipped", label: "Skipped", status: "SKIPPED" },
  { key: "failed", label: "Failed", status: "FAILED" },
];
const TYPES: { value: NonNullable<ActivityFilter["type"]>; label: string }[] = [
  { value: "PROFILE_VISIT", label: "Profile visits" },
  { value: "CONNECTION_REQUEST", label: "Invites" },
  { value: "CHECK_CONNECTION", label: "Connection checks" },
  { value: "MESSAGE", label: "Messages" },
  { value: "LIKE_POST", label: "Post likes" },
  { value: "FOLLOW_PROFILE", label: "Follows" },
  { value: "COMMENT_POST", label: "Comments" },
  { value: "EVENT_INVITE", label: "Event invites" },
  { value: "WITHDRAW_INVITE", label: "Withdrawn invites" },
  { value: "REPLY", label: "Replies from inbox" },
  { value: "SEARCH_PAGE", label: "Search imports" },
  { value: "INBOX_SYNC", label: "Inbox checks" },
];
const selectCls =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[15px] text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-200";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; type?: string; account?: string; campaign?: string; page?: string }>;
}) {
  const me = await requireChannel("linkedin");
  const sp = await searchParams;
  const status = STATUSES.find((f) => f.key === sp.show) ?? STATUSES[0]!;
  const type = TYPES.find((t) => t.value === sp.type)?.value;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const filter: ActivityFilter = { status: status.status, type, accountId: sp.account || undefined, campaignId: sp.campaign || undefined };
  const [rows, total, options] = await Promise.all([
    recentActivity(prisma, me.workspace.id, { ...filter, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    activityCount(prisma, me.workspace.id, filter),
    inboxFilterOptions(prisma, me.workspace.id),
  ]);
  const href = (o: { show?: string; page?: number }) => {
    const p = new URLSearchParams();
    const show = o.show ?? status.key;
    if (show !== "all") p.set("show", show);
    if (type) p.set("type", type);
    if (filter.accountId) p.set("account", filter.accountId);
    if (filter.campaignId) p.set("campaign", filter.campaignId);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/app/activity${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Activity" description="Every visit, like, invite, message, inbox check and search import, newest first. Failed actions keep a screenshot." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by result" className="inline-flex rounded-xl border border-stone-200 bg-white p-1 shadow-card">
          {STATUSES.map((f) => (
            <Link
              key={f.key}
              href={href({ show: f.key })}
              aria-current={f.key === status.key ? "page" : undefined}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[15px] font-medium transition-colors",
                f.key === status.key ? "bg-brand-400 text-stone-900" : "text-stone-500 hover:text-stone-900",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form action="/app/activity" className="flex flex-wrap items-center gap-2">
          {status.key !== "all" && <input type="hidden" name="show" value={status.key} />}
          <select name="type" defaultValue={type ?? ""} className={selectCls} aria-label="Action type">
            <option value="">All actions</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {options.accounts.length > 1 && (
            <select name="account" defaultValue={filter.accountId ?? ""} className={selectCls} aria-label="Account">
              <option value="">All accounts</option>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          {options.campaigns.length > 0 && (
            <select name="campaign" defaultValue={filter.campaignId ?? ""} className={selectCls} aria-label="Campaign">
              <option value="">All campaigns</option>
              {options.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button className="rounded-lg bg-stone-900 px-3 py-2 text-[15px] font-medium text-white hover:bg-stone-700">Filter</button>
        </form>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Activity} title="Nothing here" body="Actions appear here as soon as the worker runs them." />
        ) : (
          <ActivityList rows={rows} showAccount={options.accounts.length > 1} />
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[14px] text-stone-500">
            <span>
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} aria-label="Previous page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              )}
              {page * PAGE_SIZE < total && (
                <Link href={href({ page: page + 1 })} aria-label="Next page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
