import { CornerUpLeft, Eye, Inbox, ListPlus, MessageSquare, Search, ThumbsUp, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import type { ActivityRow } from "@/lib/data";
import { ACTION_LABEL, outcomeText, profilePath, slugName, timeAgo } from "@/lib/format";
import Link from "next/link";
import { EvidenceButton } from "./EvidenceButton";
import { OutcomePill } from "./StatusBadge";
import { cx } from "./ui";

const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  CONNECTION_REQUEST: { icon: UserPlus, cls: "bg-brand-100 text-brand-800" },
  MESSAGE: { icon: MessageSquare, cls: "bg-sky-50 text-sky-600" },
  PROFILE_VISIT: { icon: Eye, cls: "bg-teal-50 text-teal-600" },
  CHECK_CONNECTION: { icon: Search, cls: "bg-stone-100 text-stone-500" },
  INBOX_SYNC: { icon: Inbox, cls: "bg-amber-50 text-amber-600" },
  SEARCH_PAGE: { icon: ListPlus, cls: "bg-violet-50 text-violet-600" },
  LIKE_POST: { icon: ThumbsUp, cls: "bg-rose-50 text-rose-600" },
  WITHDRAW_INVITE: { icon: UserMinus, cls: "bg-stone-100 text-stone-500" },
  REPLY: { icon: CornerUpLeft, cls: "bg-sky-50 text-sky-600" },
};

function searchPageNo(url: string | null): number {
  try {
    return Number(new URL(url ?? "").searchParams.get("page") ?? "1") || 1;
  } catch {
    return 1;
  }
}

export function ActivityList({ rows, showAccount, compact }: { rows: ActivityRow[]; showAccount: boolean; compact?: boolean }) {
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((r) => {
        const lead = r.campaignLead;
        const who =
          r.type === "REPLY"
            ? String((r.payload as { name?: unknown } | null)?.name ?? "")
            : r.type === "SEARCH_PAGE"
            ? `Page ${searchPageNo(r.targetUrl)}`
            : lead?.linkedinName || [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || slugName(r.targetUrl);
        const when = r.executedAt ?? r.scheduledAt;
        const { icon: Icon, cls } = ICON[r.type] ?? ICON.CHECK_CONNECTION!;
        return (
          <li key={r.id} className={cx("flex items-center gap-3", compact ? "px-5 py-3" : "px-5 py-3.5")}>
            <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cls)}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] text-stone-900">
                <span className="font-medium">{ACTION_LABEL[r.type] ?? r.type}</span>
                {who && (
                  <>
                    <span className="text-stone-400"> · </span>
                    <a
                      href={r.targetUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={profilePath(r.targetUrl)}
                      className="capitalize text-stone-600 hover:text-stone-900 hover:underline"
                    >
                      {who}
                    </a>
                  </>
                )}
              </p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                <OutcomePill status={r.status}>{outcomeText(r)}</OutcomePill>
                {lead && !compact && (
                  <Link href={`/app/campaigns/${lead.campaign.id}`} className="truncate text-[13px] font-medium text-brand-800 hover:underline">
                    {lead.campaign.name}
                  </Link>
                )}
                {r.status === "FAILED" && r.screenshotPath && !compact && <EvidenceButton actionId={r.id} error={(r.error ?? "").split("\n")[0]!} />}
              </div>
            </div>
            <div className="shrink-0 text-right text-[14px] text-stone-400">
              <p>{timeAgo(when)}</p>
              {showAccount && <p className="mt-0.5">{r.account.label}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
