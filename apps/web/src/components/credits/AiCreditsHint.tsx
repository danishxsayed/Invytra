import { Sparkles } from "lucide-react";
import { cx } from "../ui";

/** "1 AI credit · 412 left" next to an AI button. */
export function AiCreditsHint({ cost, left, className }: { cost: number; left: number | null; className?: string }) {
  const low = left !== null && left < cost;
  return (
    <span className={cx("inline-flex items-center gap-1 text-[13px]", low ? "font-medium text-rose-600" : "text-stone-500", className)}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {cost} AI credit{cost === 1 ? "" : "s"}
      {left !== null && <> · {low ? "not enough left" : `${left.toLocaleString("en-US")} left`}</>}
    </span>
  );
}
