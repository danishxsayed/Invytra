import { prisma } from "@invytra/db";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { ConversationView, type ConversationViewData } from "@/components/inbox/ConversationView";
import { FilterBar } from "@/components/inbox/FilterBar";
import { Avatar, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { progressText } from "@/lib/campaign-text";
import { dayLabel, shortWhen } from "@/lib/format";
import {
  INBOX_FILTERS,
  SUGGESTED_TAGS,
  conversationList,
  getConversation,
  inboxCounts,
  inboxFilterOptions,
  type ConversationFull,
  type InboxFilter,
} from "@/lib/inbox";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const FILTER_LABEL: Record<InboxFilter, string> = { needs_reply: "Needs reply", unread: "Unread", replied: "Replied", all: "All", done: "Done" };
const ACTIVE = ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"];

const headline = (l: { title: string | null; company: string | null } | null) => (l ? [l.title, l.company].filter(Boolean).join(" · ") : "");

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; c?: string; account?: string; campaign?: string; tag?: string; q?: string; page?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const filter: InboxFilter = (INBOX_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as InboxFilter) : "needs_reply";
  const query = { accountId: sp.account || undefined, campaignId: sp.campaign || undefined, tag: sp.tag || undefined, q: (sp.q ?? "").slice(0, 100) };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ total, rows }, counts, options, open] = await Promise.all([
    conversationList(prisma, me.workspace.id, { ...query, filter, page, pageSize: PAGE_SIZE }),
    inboxCounts(prisma, me.workspace.id, query),
    inboxFilterOptions(prisma, me.workspace.id),
    sp.c ? getConversation(prisma, me.workspace.id, sp.c) : Promise.resolve(null),
  ]);
  const now = new Date();

  const href = (o: { f?: InboxFilter; c?: string | null; page?: number }) => {
    const p = new URLSearchParams();
    const f = o.f ?? filter;
    if (f !== "needs_reply") p.set("f", f);
    for (const [k, v] of [["account", query.accountId], ["campaign", query.campaignId], ["tag", query.tag], ["q", query.q]] as const) if (v) p.set(k, v);
    const c = o.c === undefined ? sp.c : o.c;
    if (c) p.set("c", c);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    return `/app/inbox${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Inbox" description="Your LinkedIn conversations, checked about once an hour and before every campaign message. Reply right here." />

      <Card className="overflow-hidden lg:grid lg:min-w-0 lg:h-[calc(100vh-190px)] lg:min-h-[560px] lg:grid-cols-[400px_1fr]">
        {/* Conversation list */}
        <div className={cx("flex min-h-0 min-w-0 flex-col overflow-hidden border-stone-100 lg:border-r", open && "hidden lg:flex")}>
          <FilterBar accounts={options.accounts} campaigns={options.campaigns} tags={options.tags} />
          <nav className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-stone-100 px-3 py-2" aria-label="Show">
            {INBOX_FILTERS.map((f) => (
              <Link
                key={f}
                href={href({ f, c: null })}
                aria-current={f === filter ? "page" : undefined}
                className={cx(
                  "rounded-full px-2.5 py-1 text-[13px] font-medium transition",
                  f === filter ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-600 hover:bg-stone-100",
                )}
              >
                {FILTER_LABEL[f]} <span className={f === filter ? "text-stone-300" : "text-stone-400"}>{counts[f].toLocaleString()}</span>
              </Link>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title={filter === "needs_reply" ? "You're all caught up" : "Nothing here"}
                body={filter === "needs_reply" ? "New replies land here. Once you answer, or mark them done, they move out." : "Try another filter."}
              />
            ) : (
              <ul className="divide-y divide-stone-100">
                {rows.map((r) => {
                  const lead = r.campaignLead;
                  const needs = !r.lastFromMe && !r.doneAt;
                  const selected = r.id === sp.c;
                  return (
                    <li key={r.id}>
                      <Link
                        href={href({ c: r.id })}
                        className={cx("flex gap-3 px-4 py-3.5 transition", selected ? "bg-brand-50 shadow-[inset_3px_0_0] shadow-brand-500" : "hover:bg-stone-50")}
                      >
                        <span className="relative">
                          <Avatar name={r.participantName} />
                          {r.unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white" aria-label="Unread" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cx("truncate text-[15px]", needs ? "font-semibold text-stone-900" : "font-medium text-stone-700")}>{r.participantName}</span>
                            <span className="shrink-0 text-[12px] text-stone-400">{shortWhen(r.lastMessageAt, r.account.timezone, now)}</span>
                          </span>
                          {headline(lead) && <span className="block truncate text-[13px] text-stone-500">{headline(lead)}</span>}
                          {lead && (
                            <span className="block truncate text-[12px] text-stone-400">
                              {lead.campaign.name} ·{" "}
                              <span className={lead.state === "REPLIED" ? "text-emerald-700" : lead.state === "PAUSED" ? "text-amber-700" : ""}>{progressText(lead)}</span>
                            </span>
                          )}
                          {r.tags.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {r.tags.map((t) => (
                                <span key={t} className="rounded-full bg-violet-50 px-2 py-0.5 text-[12px] font-medium text-violet-700">
                                  {t}
                                </span>
                              ))}
                            </span>
                          )}
                          <span className={cx("mt-1 block truncate text-[13px]", needs ? "text-stone-700" : "text-stone-500")}>
                            <b className="font-medium">{r.lastFromMe ? "You" : r.participantName.split(" ")[0]}:</b> {r.lastMessageText}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {total > PAGE_SIZE && (
              <div className="flex justify-between border-t border-stone-100 px-4 py-2.5 text-[13px]">
                {page > 1 ? (
                  <Link href={href({ page: page - 1, c: null })} className="font-medium text-stone-600 hover:text-stone-900">
                    ← Newer
                  </Link>
                ) : (
                  <span />
                )}
                {page * PAGE_SIZE < total && (
                  <Link href={href({ page: page + 1, c: null })} className="font-medium text-stone-600 hover:text-stone-900">
                    Older →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Open conversation */}
        <div className={cx("min-h-0 min-w-0", !open && "hidden lg:block")}>
          {open ? (
            <ConversationView key={open.id} c={toView(open, now)} suggestions={[...new Set([...options.tags, ...SUGGESTED_TAGS])]} backHref={href({ c: null })} />
          ) : (
            <div className="flex h-full items-center justify-center p-10">
              <EmptyState
                icon={MessagesSquare}
                title="Pick a conversation"
                body="Read the whole chat, tag it, pause the campaign for that person, and reply without leaving Invytra."
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function toView(c: ConversationFull, now: Date): ConversationViewData {
  const tz = c.account.timezone;
  const lead = c.campaignLead;
  return {
    id: c.id,
    name: c.participantName,
    account: { label: c.account.label, active: c.account.status === "ACTIVE" },
    lead: lead
      ? {
          profileUrl: lead.profileUrl,
          headline: headline(lead),
          campaign: { id: lead.campaign.id, name: lead.campaign.name },
          progress: progressText(lead),
          paused: lead.state === "PAUSED",
          canPause: ACTIVE.includes(lead.state),
        }
      : null,
    tags: c.tags,
    done: !!c.doneAt || c.lastFromMe,
    messages: c.messages.map((m) => ({
      id: m.id,
      fromMe: m.fromMe,
      text: m.text,
      day: dayLabel(m.sentAt, tz, now),
      time: m.sentAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
    })),
    pending: c.replies.map((r) => ({
      id: r.id,
      text: String((r.payload as { text?: unknown } | null)?.text ?? ""),
      failed: r.status === "FAILED" || r.status === "SKIPPED",
      error: r.error && !r.error.startsWith("waiting: ") ? r.error.split("\n")[0]! : null,
    })),
  };
}
