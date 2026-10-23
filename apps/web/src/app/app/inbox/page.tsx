import { prisma } from "@invytra/db";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { InboxList } from "@/components/InboxList";
import { Card, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { INBOX_TABS, inboxFilterOptions, inboxPage, inboxTabCounts, type InboxTab } from "@/lib/inbox";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const TAB_LABEL: Record<InboxTab, string> = { needs_reply: "Needs reply", all: "All", done: "Done" };
const selectCls =
  "rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[15px] text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-200";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; account?: string; campaign?: string; q?: string; page?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const tab: InboxTab = (INBOX_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as InboxTab) : "needs_reply";
  const filters = { accountId: sp.account || undefined, campaignId: sp.campaign || undefined, q: (sp.q ?? "").slice(0, 100) };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ total, rows }, counts, options] = await Promise.all([
    inboxPage(prisma, me.workspace.id, { ...filters, tab, page, pageSize: PAGE_SIZE }),
    inboxTabCounts(prisma, me.workspace.id, filters),
    inboxFilterOptions(prisma, me.workspace.id),
  ]);
  const now = new Date();
  const href = (o: { tab?: InboxTab; page?: number }) => {
    const p = new URLSearchParams();
    const t = o.tab ?? tab;
    if (t !== "needs_reply") p.set("tab", t);
    if (filters.accountId) p.set("account", filters.accountId);
    if (filters.campaignId) p.set("campaign", filters.campaignId);
    if (filters.q) p.set("q", filters.q);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return `/app/inbox${s ? `?${s}` : ""}`;
  };
  const items = rows.map((m) => ({
    id: m.id,
    fromName: m.fromName,
    text: m.text,
    when: timeAgo(m.fetchedAt, now),
    account: m.account.label,
    done: !!m.doneAt,
    answered: !!m.answeredAt,
    lead: m.campaignLead ? { profileUrl: m.campaignLead.profileUrl, company: m.campaignLead.company, title: m.campaignLead.title, campaign: m.campaignLead.campaign } : null,
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Inbox" description="Replies from your LinkedIn conversations, read about once an hour and before every campaign message." />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-3 py-2.5">
          <nav className="flex gap-1" aria-label="Inbox tabs">
            {INBOX_TABS.map((t) => (
              <Link
                key={t}
                href={href({ tab: t })}
                aria-current={t === tab ? "page" : undefined}
                className={cx("rounded-lg px-3 py-1.5 text-[15px] font-medium transition", t === tab ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}
              >
                {TAB_LABEL[t]} <span className={t === tab ? "text-stone-300" : "text-stone-400"}>{counts[t].toLocaleString()}</span>
              </Link>
            ))}
          </nav>
          <form className="flex flex-wrap items-center gap-2" action="/app/inbox">
            {tab !== "needs_reply" && <input type="hidden" name="tab" value={tab} />}
            <label className="relative">
              <span className="sr-only">Search replies</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input name="q" defaultValue={filters.q} placeholder="Search" className={cx(selectCls, "w-40 pl-8")} />
            </label>
            {options.accounts.length > 1 && (
              <select name="account" defaultValue={filters.accountId ?? ""} className={selectCls} aria-label="Account">
                <option value="">All accounts</option>
                {options.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
            {options.campaigns.length > 0 && (
              <select name="campaign" defaultValue={filters.campaignId ?? ""} className={selectCls} aria-label="Campaign">
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
        <InboxList
          items={items}
          showAccount={options.accounts.length > 1}
          emptyTitle={tab === "needs_reply" ? "You're all caught up" : "No replies here"}
          emptyBody={
            tab === "needs_reply"
              ? "New replies land here. Once you answer on LinkedIn — or mark them done — they move out."
              : "When someone answers an invite or message, it shows up here."
          }
        />
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
