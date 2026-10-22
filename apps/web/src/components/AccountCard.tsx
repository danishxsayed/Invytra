import { Clock, Globe2 } from "lucide-react";
import type { AccountOverview } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { Avatar, Card, UsageBar } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hoursText(h: AccountOverview["workingHours"]): string {
  const days = h.days.length === 5 && h.days.every((d, i) => d === i + 1) ? "Mon–Fri" : h.days.map((d) => DAYS[d - 1]).join(", ");
  const pad = (n: number) => `${String(n).padStart(2, "0")}:00`;
  return `${days} · ${pad(h.startHour)}–${pad(h.endHour)}`;
}

export function AccountCard({ a }: { a: AccountOverview }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={a.label} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-stone-900">{a.label}</h3>
            <StatusBadge status={a.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-stone-500">
            {a.queued > 0 ? `${a.queued} action${a.queued === 1 ? "" : "s"} queued` : "Nothing queued"}
            {a.lastActiveAt && ` · last active ${timeAgo(a.lastActiveAt)}`}
          </p>
        </div>
      </div>
      {a.statusReason && a.status !== "ACTIVE" && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{a.statusReason}</p>
      )}
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
        <UsageBar label="Invites today" used={a.usage.today.CONNECTION_REQUEST} limit={a.limits.connectionRequestsPerDay} />
        <UsageBar label="Messages today" used={a.usage.today.MESSAGE} limit={a.limits.messagesPerDay} />
        <UsageBar label="Profile visits today" used={a.usage.today.PROFILE_VISIT} limit={a.limits.profileVisitsPerDay} />
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-stone-100 pt-4 text-[12px] text-stone-500">
        <span className="tabular">
          Invites this week{" "}
          <span className="font-medium text-stone-800">
            {a.usage.connectionRequestsThisWeek}/{a.limits.connectionRequestsPerWeek}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {hoursText(a.workingHours)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Globe2 className="h-3.5 w-3.5" aria-hidden /> {a.timezone}
        </span>
      </div>
    </Card>
  );
}
