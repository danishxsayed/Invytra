import { CAMPAIGN_STATUS, LEAD_STATE } from "@/lib/campaign-text";
import { cx } from "../ui";

export function CampaignStatusBadge({ status }: { status: string }) {
  const s = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.DRAFT!;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[14px] font-medium ring-1 ring-inset", s.cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function LeadStateBadge({ state }: { state: string }) {
  const s = LEAD_STATE[state] ?? LEAD_STATE.QUEUED!;
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium", s.cls)}>{s.label}</span>;
}

/** A labelled number with an optional rate underneath. */
export function Metric({ label, value, rate, hint }: { label: string; value: number; rate?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white px-4 py-3.5 shadow-card">
      <p className="text-[14px] text-stone-500" title={hint}>
        {label}
      </p>
      <p className="mt-1 text-[28px] font-semibold tabular-nums leading-none text-stone-900">{value.toLocaleString()}</p>
      {rate && <p className="mt-1.5 text-[14px] font-medium text-brand-800">{rate}</p>}
    </div>
  );
}
