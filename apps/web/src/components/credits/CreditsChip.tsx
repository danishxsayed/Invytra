import { Sparkles } from "lucide-react";
import { cx } from "../ui";

/** "✦ 412 AI credits": always visible in each app's header, opens the Credits page. */
export function CreditsChip({ left, href, compact, className }: { left: number; href: string; compact?: boolean; className?: string }) {
  const low = left < 20;
  return (
    <a
      href={href}
      title="AI credits left (all channels). Open the Credits page."
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors",
        low ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-stone-900 text-white hover:bg-stone-800",
        className,
      )}
    >
      <Sparkles className={cx("h-3.5 w-3.5", low ? "text-rose-500" : "text-brand-400")} aria-hidden />
      <span className="tabular">{left.toLocaleString("en-US")}</span>
      {!compact && <span className={low ? "" : "text-white/70"}>AI credits</span>}
    </a>
  );
}
