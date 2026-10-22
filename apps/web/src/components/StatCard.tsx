import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card, cx } from "./ui";

export function StatCard({
  label,
  icon: Icon,
  tone,
  now,
  prev,
}: {
  label: string;
  icon: LucideIcon;
  tone: string;
  now: number;
  prev: number;
}) {
  const delta = prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100);
  const up = delta >= 0;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-zinc-500">{label}</span>
        <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-tight text-zinc-900">{now}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-1 text-[12px] text-zinc-500">
        {now === 0 && prev === 0 ? (
          "No activity yet"
        ) : prev === 0 ? (
          <span className="font-medium text-emerald-600">New this week</span>
        ) : (
          <>
            <span className={cx("inline-flex items-center gap-0.5 font-medium", up ? "text-emerald-600" : "text-rose-600")}>
              {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
              {Math.abs(delta)}%
            </span>
            vs last week
          </>
        )}
      </p>
    </Card>
  );
}
