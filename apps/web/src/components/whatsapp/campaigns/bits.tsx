import { WA_CAMPAIGN_STATUS } from "@invytra/shared";
import type { WaCampaignStats } from "@/lib/whatsapp-campaigns";
import { cx } from "../../ui";

const TONE = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-rose-50 text-rose-700", stone: "bg-stone-100 text-stone-600", sky: "bg-sky-50 text-sky-700" };

export function CampaignStatus({ status }: { status: string }) {
  const s = WA_CAMPAIGN_STATUS[status] ?? { label: status, tone: "stone" as const };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12.5px] font-semibold", TONE[s.tone])}>
      {status === "SENDING" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {s.label}
    </span>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Sent → delivered → read → replied, with rates against what was sent. */
export function Funnel({ s, big }: { s: WaCampaignStats; big?: boolean }) {
  const items = [
    { label: "Sent", n: s.sent, sub: s.queued ? `${s.queued.toLocaleString("en-US")} waiting` : `of ${s.total.toLocaleString("en-US")}` },
    { label: "Delivered", n: s.delivered, sub: `${pct(s.delivered, s.sent)}%` },
    { label: "Read", n: s.read, sub: `${pct(s.read, s.sent)}%` },
    { label: "Replied", n: s.replied, sub: `${pct(s.replied, s.sent)}%` },
    { label: "Failed", n: s.failed + s.skipped, sub: s.failed + s.skipped ? `${pct(s.failed + s.skipped, s.total)}%` : "none" },
  ];
  return (
    <dl className={cx("grid grid-cols-5 gap-2", big && "gap-3")}>
      {items.map((x) => (
        <div key={x.label} className={cx("rounded-xl bg-stone-50 ring-1 ring-stone-100", big ? "px-4 py-3" : "px-2.5 py-2")}>
          <dt className={cx("text-stone-500", big ? "text-[13.5px]" : "text-[12px]")}>{x.label}</dt>
          <dd className={cx("font-semibold tabular-nums text-stone-900", big ? "text-[24px]" : "text-[16px]")}>{x.n.toLocaleString("en-US")}</dd>
          <dd className={cx("text-stone-400", big ? "text-[13px]" : "text-[11.5px]")}>{x.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
