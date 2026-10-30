import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Globe2, PauseCircle, Plug, Router, Sprout } from "lucide-react";
import { WARMUP_DAYS } from "@invytra/shared";
import { explainStatus, problemOf } from "@/lib/accounts";
import type { AccountOverview } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { AccountControls } from "./AccountControls";
import { StatusBadge } from "./StatusBadge";
import { Avatar, Card, UsageBar, cx } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function hoursText(h: AccountOverview["workingHours"]): string {
  const sorted = [...h.days].sort();
  const days =
    sorted.length === 5 && sorted.every((d, i) => d === i + 1)
      ? "Mon–Fri"
      : sorted.length === 7
        ? "Every day"
        : sorted.map((d) => DAYS[d - 1]).join(", ");
  const pad = (n: number) => `${String(n).padStart(2, "0")}:00`;
  return `${days} · ${pad(h.startHour)}–${pad(h.endHour)}`;
}

const TONE = {
  ok: { box: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  warn: { box: "bg-amber-50 text-amber-800", icon: PauseCircle },
  danger: { box: "bg-rose-50 text-rose-800", icon: AlertTriangle },
  neutral: { box: "bg-stone-50 text-stone-700", icon: Plug },
} as const;

/** One LinkedIn account: health in plain words, today's allowance, settings summary, controls. */
export function AccountPanel({ a, full = true }: { a: AccountOverview; full?: boolean }) {
  const why = explainStatus(a.status, a.statusReason, a.hasSession);
  const tone = TONE[why.tone];
  const Icon = tone.icon;
  const controls = (
    <AccountControls
      id={a.id}
      label={a.label}
      status={a.status}
      next={why.next}
      canResumeAfterCheck={a.status === "NEEDS_ATTENTION" && a.hasSession && problemOf(a.statusReason) !== "RESTRICTED"}
      full={full}
    />
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={a.profileName ?? a.label} size="lg" src={a.photo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[18px] font-semibold text-stone-900">{a.label}</h3>
            <StatusBadge status={a.status} />
            {a.premium !== null && (
              <span
                title="Detected from the account's own LinkedIn profile"
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-[13px] font-medium",
                  a.premium ? "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20" : "bg-stone-100 text-stone-600",
                )}
              >
                {a.premium ? "LinkedIn Premium" : "Free LinkedIn"}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[15px] text-stone-500">
            {a.profileName &&
              (a.profileUrl ? (
                <a href={a.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-stone-700 hover:text-stone-900">
                  {a.profileName} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : (
                <span className="font-medium text-stone-700">{a.profileName}</span>
              ))}
            <span>
              {a.queued > 0 ? `${a.queued} action${a.queued === 1 ? "" : "s"} queued` : "Nothing queued"}
              {a.lastActiveAt && ` · last active ${timeAgo(a.lastActiveAt)}`}
            </span>
          </p>
        </div>
      </div>

      {a.status !== "ACTIVE" && (
        <div className={cx("mt-4 flex gap-3 rounded-xl px-4 py-3", tone.box)}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{why.title}</p>
            <p className="text-[15px] opacity-90">{why.body}</p>
          </div>
        </div>
      )}

      {a.hasSession && (
        <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <UsageBar label="Invites today" used={a.usage.today.CONNECTION_REQUEST} limit={a.limits.connectionRequestsPerDay} />
          <UsageBar label="Messages today" used={a.usage.today.MESSAGE} limit={a.limits.messagesPerDay} />
          <UsageBar label="Profile visits today" used={a.usage.today.PROFILE_VISIT} limit={a.limits.profileVisitsPerDay} />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-stone-100 pt-4 text-[14px] text-stone-500">
        {a.hasSession && (
          <span className="tabular">
            Invites this week{" "}
            <span className="font-medium text-stone-800">
              {a.usage.connectionRequestsThisWeek}/{a.limits.connectionRequestsPerWeek}
            </span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {hoursText(a.workingHours)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Globe2 className="h-3.5 w-3.5" aria-hidden /> {a.timezone.replace(/_/g, " ")}
        </span>
        {full && (
          <span className="inline-flex items-center gap-1">
            <Router className="h-3.5 w-3.5" aria-hidden />{" "}
            {a.viaUnipile ? "Connected through Unipile (IP provided by Unipile)" : a.proxy ? `Proxy ${a.proxy}` : "No proxy yet"}
          </span>
        )}
        {a.warmupDay !== null && (
          <span className="inline-flex items-center gap-1 text-brand-800">
            <Sprout className="h-3.5 w-3.5" aria-hidden /> Warming up · day {a.warmupDay} of {WARMUP_DAYS}
          </span>
        )}
      </div>

      {(full || why.next === "connect" || why.next === "reconnect" || a.status === "PAUSED") && <div className="mt-4">{controls}</div>}
    </Card>
  );
}
