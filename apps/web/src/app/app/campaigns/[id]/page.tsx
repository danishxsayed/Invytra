import { prisma } from "@invytra/db";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Eye, Hourglass, MessageSquare, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignControls } from "@/components/campaign/CampaignControls";
import { CampaignStatusBadge, LeadStateBadge, Metric } from "@/components/campaign/CampaignBits";
import { Avatar, Card, EmptyState, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pct, positionText, reasonText, stepLabel } from "@/lib/campaign-text";
import { CampaignNotFoundError, LEAD_FILTERS, campaignLeadsPage, campaignStats, getCampaign, launchProblems, type LeadFilter } from "@/lib/campaigns";
import { slugName, timeAgo } from "@/lib/format";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const FILTER_LABEL: Record<LeadFilter, string> = {
  all: "All",
  active: "In progress",
  waiting: "Invite sent",
  replied: "Replied",
  done: "Done",
  not_accepted: "Didn't accept",
  skipped: "Skipped / failed",
};
const STEP_ICON = { VISIT: Eye, INVITE: UserPlus, MESSAGE: MessageSquare } as const;

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const filter: LeadFilter = sp.filter && sp.filter in LEAD_FILTERS ? (sp.filter as LeadFilter) : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let c;
  try {
    c = await getCampaign(prisma, me.workspace.id, id);
  } catch (e) {
    if (e instanceof CampaignNotFoundError) notFound();
    throw e;
  }
  const [stats, { total, rows }, problems] = await Promise.all([
    campaignStats(prisma, me.workspace.id, [c.id]).then((m) => m.get(c.id)!),
    campaignLeadsPage(prisma, me.workspace.id, c.id, { filter, page, pageSize: PAGE_SIZE }),
    launchProblems(prisma, me.workspace.id, c),
  ]);
  const now = new Date();
  const count = (f: LeadFilter) => (f === "all" ? stats.total : LEAD_FILTERS[f].reduce((n, s) => n + (stats.byState[s] ?? 0), 0));
  const contacted = Math.max(stats.invited, stats.messaged);
  const href = (f: LeadFilter, p = 1) => `/app/campaigns/${c.id}?${new URLSearchParams({ ...(f !== "all" && { filter: f }), ...(p > 1 && { page: String(p) }) })}`;
  const accountProblem =
    !c.account ? "The sending account was removed. Edit the campaign to choose another." : c.account.status !== "ACTIVE" ? `“${c.account.label}” isn't connected and active, so nothing is sent until it is.` : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link href="/app/campaigns" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-stone-500 hover:text-stone-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Campaigns
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-[34px] font-semibold tracking-tight text-stone-900">{c.name}</h1>
              <CampaignStatusBadge status={c.status} />
            </div>
            <p className="mt-1 text-[16px] text-stone-500">
              {c.account ? (
                <Link href={`/app/accounts/${c.account.id}`} className="font-medium text-stone-700 hover:underline">
                  {c.account.label}
                </Link>
              ) : (
                "No account"
              )}{" "}
              →{" "}
              {c.list ? (
                <Link href={`/app/leads/${c.list.id}`} className="font-medium text-stone-700 hover:underline">
                  {c.list.name}
                </Link>
              ) : (
                "list removed"
              )}
              {c.startedAt && ` · started ${timeAgo(c.startedAt, now)}`}
            </p>
          </div>
          <CampaignControls id={c.id} name={c.name} status={c.status} problems={problems} />
        </div>
      </div>

      {c.status === "ACTIVE" && accountProblem && <Banner>{accountProblem}</Banner>}
      {c.status === "DRAFT" && problems.length > 0 && <Banner>Before launching: {problems[0]}</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Leads" value={stats.total} />
        <Metric label="Invited" value={stats.invited} />
        <Metric label="Accepted" value={stats.accepted} rate={stats.invited ? `${pct(stats.accepted, stats.invited)}% of invited` : undefined} />
        <Metric label="Messaged" value={stats.messaged} />
        <Metric
          label="Replied"
          value={stats.replied}
          rate={contacted ? `${pct(stats.replied, contacted)}% of contacted` : undefined}
          hint="Replies are matched by name — LinkedIn's inbox list doesn't show profile links."
        />
      </div>

      <Card className="px-5 py-4">
        <p className="mb-3 text-[14px] font-medium uppercase tracking-wide text-stone-400">Sequence</p>
        <ol className="flex flex-wrap items-center gap-2 text-[15px]">
          {c.steps.map((s, i) => {
            const Icon = STEP_ICON[s.type];
            return (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-[13px] text-stone-400">
                    {c.steps[i - 1]!.type === "INVITE" ? (
                      <span className="inline-flex items-center gap-1">
                        <Hourglass className="h-3.5 w-3.5" aria-hidden /> accepts, +{s.delayDays}d →
                      </span>
                    ) : (
                      `+${s.delayDays}d →`
                    )}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
                  <Icon className="h-4 w-4 text-stone-500" aria-hidden /> {stepLabel(s)}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card className="overflow-hidden">
        <nav className="flex gap-1 overflow-x-auto border-b border-stone-100 px-3 py-2" aria-label="Filter leads">
          {(Object.keys(LEAD_FILTERS) as LeadFilter[]).map((f) => (
            <Link
              key={f}
              href={href(f)}
              className={cx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] font-medium transition",
                f === filter ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100",
              )}
            >
              {FILTER_LABEL[f]} <span className={f === filter ? "text-stone-300" : "text-stone-400"}>{count(f).toLocaleString()}</span>
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={c.status === "DRAFT" ? "Leads join when you launch" : stats.total === 0 ? "Adding leads…" : "No leads here"}
            body={
              c.status === "DRAFT"
                ? "Everyone in the list is added when the campaign starts. New leads added to the list later join automatically."
                : stats.total === 0
                  ? "The worker adds the list's leads within a minute. Make sure `pnpm worker` is running."
                  : "Try another filter."
            }
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((l) => {
              const name = l.linkedinName || [l.firstName, l.lastName].filter(Boolean).join(" ") || slugName(l.profileUrl) || "LinkedIn member";
              const detail = ["SKIPPED", "FAILED", "NOT_ACCEPTED"].includes(l.state) ? reasonText(l.reason) : positionText(c.steps, l.state, l.step);
              const next =
                l.actionId ? "Queued now" : l.nextAt && ["QUEUED", "IN_PROGRESS", "WAITING_ACCEPT"].includes(l.state) ? (l.nextAt <= now ? "Due now" : `Next ${timeAgo(l.nextAt, now)}`) : "";
              return (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={name} />
                  <div className="min-w-0 flex-1">
                    <a href={l.profileUrl} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 text-[15px] font-medium capitalize text-stone-900 hover:underline">
                      <span className="truncate">{name}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
                    </a>
                    <p className="truncate text-[14px] text-stone-500">{detail || [l.title, l.company].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <LeadStateBadge state={l.state} />
                    <span className="text-[13px] text-stone-400">{next || (l.lastActionAt ? timeAgo(l.lastActionAt, now) : "")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-[14px] text-stone-500">
            <span>
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              {page > 1 && (
                <Link href={href(filter, page - 1)} aria-label="Previous page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              )}
              {page * PAGE_SIZE < total && (
                <Link href={href(filter, page + 1)} aria-label="Next page" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-50">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
      <p className="text-[14px] text-stone-400">
        Replies are matched by the person's name, because LinkedIn's inbox list doesn't show profile links. Two leads with exactly the same name could
        be mixed up.
      </p>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-[15px] text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
