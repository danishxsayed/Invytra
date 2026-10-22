import type { ActivityRow } from "@/lib/data";
import { ACTION_LABEL, outcomeText, profilePath, slugName, timeAgo } from "@/lib/format";
import { OutcomeDot } from "./StatusBadge";

export function ActivityList({ rows, showAccount }: { rows: ActivityRow[]; showAccount: boolean }) {
  if (rows.length === 0) {
    return <p className="py-6 text-ink-soft">Nothing yet. Actions appear here as soon as the worker runs them.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const who = slugName(r.targetUrl);
        const when = r.executedAt ?? r.scheduledAt;
        return (
          <li key={r.id} className="flex gap-3 py-3">
            <OutcomeDot status={r.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-medium">{ACTION_LABEL[r.type] ?? r.type}</span>
                {who && (
                  <>
                    {" "}
                    <a
                      href={r.targetUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="capitalize text-ink-soft underline-offset-2 hover:underline"
                      title={profilePath(r.targetUrl)}
                    >
                      {who}
                    </a>
                  </>
                )}
              </p>
              <p className={`truncate text-sm ${r.status === "FAILED" ? "text-rose" : "text-ink-soft"}`}>{outcomeText(r)}</p>
            </div>
            <div className="shrink-0 text-right text-sm text-ink-faint">
              <p>{timeAgo(when)}</p>
              {showAccount && <p>{r.account.label}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
