import type { AccountOverview } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { TickStrip } from "./TickStrip";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hoursText(h: AccountOverview["workingHours"]): string {
  const days = h.days.length === 5 && h.days.every((d, i) => d === i + 1) ? "Mon–Fri" : h.days.map((d) => DAYS[d - 1]).join(", ");
  const pad = (n: number) => `${String(n).padStart(2, "0")}:00`;
  return `${days}, ${pad(h.startHour)}–${pad(h.endHour)}`;
}

export function AccountRow({ a }: { a: AccountOverview }) {
  return (
    <article className="rounded-lg border border-line bg-white px-5 py-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">{a.label}</h3>
        <StatusBadge status={a.status} />
        <span className="ml-auto text-sm text-ink-faint">
          {a.queued > 0 ? `${a.queued} queued` : "Nothing queued"}
          {a.lastActiveAt && ` · active ${timeAgo(a.lastActiveAt)}`}
        </span>
      </header>
      {a.statusReason && a.status !== "ACTIVE" && <p className="mt-1 text-sm text-rose">{a.statusReason}</p>}
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <TickStrip label="Invites, last 24 h" used={a.usage.today.CONNECTION_REQUEST} limit={a.limits.connectionRequestsPerDay} />
        <TickStrip label="Messages" used={a.usage.today.MESSAGE} limit={a.limits.messagesPerDay} />
        <TickStrip label="Profile visits" used={a.usage.today.PROFILE_VISIT} limit={a.limits.profileVisitsPerDay} />
      </div>
      <p className="mt-3 text-sm text-ink-faint">
        {a.usage.connectionRequestsThisWeek} of {a.limits.connectionRequestsPerWeek} invites this week · works {hoursText(a.workingHours)} ({a.timezone})
      </p>
    </article>
  );
}
