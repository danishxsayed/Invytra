import { Eye, Inbox, MessageSquare, Search, UserPlus, type LucideIcon } from "lucide-react";
import type { ActivityRow } from "@/lib/data";
import { ACTION_LABEL, outcomeText, profilePath, slugName, timeAgo } from "@/lib/format";
import { OutcomePill } from "./StatusBadge";
import { cx } from "./ui";

const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  CONNECTION_REQUEST: { icon: UserPlus, cls: "bg-brand-50 text-brand-600" },
  MESSAGE: { icon: MessageSquare, cls: "bg-sky-50 text-sky-600" },
  PROFILE_VISIT: { icon: Eye, cls: "bg-teal-50 text-teal-600" },
  CHECK_CONNECTION: { icon: Search, cls: "bg-zinc-100 text-zinc-500" },
  INBOX_SYNC: { icon: Inbox, cls: "bg-amber-50 text-amber-600" },
};

export function ActivityList({ rows, showAccount, compact }: { rows: ActivityRow[]; showAccount: boolean; compact?: boolean }) {
  return (
    <ul className="divide-y divide-zinc-100">
      {rows.map((r) => {
        const who = slugName(r.targetUrl);
        const when = r.executedAt ?? r.scheduledAt;
        const { icon: Icon, cls } = ICON[r.type] ?? ICON.CHECK_CONNECTION!;
        return (
          <li key={r.id} className={cx("flex items-center gap-3", compact ? "px-5 py-3" : "px-5 py-3.5")}>
            <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cls)}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-zinc-900">
                <span className="font-medium">{ACTION_LABEL[r.type] ?? r.type}</span>
                {who && (
                  <>
                    <span className="text-zinc-400"> · </span>
                    <a
                      href={r.targetUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={profilePath(r.targetUrl)}
                      className="capitalize text-zinc-600 hover:text-brand-600 hover:underline"
                    >
                      {who}
                    </a>
                  </>
                )}
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2">
                <OutcomePill status={r.status}>{outcomeText(r)}</OutcomePill>
              </div>
            </div>
            <div className="shrink-0 text-right text-[12px] text-zinc-400">
              <p>{timeAgo(when)}</p>
              {showAccount && <p className="mt-0.5">{r.account.label}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
