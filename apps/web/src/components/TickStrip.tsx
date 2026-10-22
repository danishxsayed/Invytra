/**
 * A day's allowance as a row of ticks: one tick per action allowed, filled as
 * they're used. Over 40 ticks, each tick stands for a group so the strip stays short.
 */
export function TickStrip({ used, limit, label }: { used: number; limit: number; label: string }) {
  const per = limit > 40 ? Math.ceil(limit / 40) : 1;
  const total = Math.ceil(limit / per);
  const filled = Math.min(total, Math.ceil(used / per));
  const full = used >= limit;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className={`text-sm font-semibold ${full ? "text-amber" : "text-ink"}`}>
          {used}
          <span className="font-normal text-ink-faint"> / {limit}</span>
        </span>
      </div>
      <div
        className="mt-1.5 flex gap-[3px]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 flex-1 rounded-[1px] ${i < filled ? (full ? "bg-amber" : "bg-pine") : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
