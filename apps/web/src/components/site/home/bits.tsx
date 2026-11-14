import Link from "next/link";
import { BARE_LOGO, CHANNEL_IMG } from "../../channel-images";
import { cx } from "../../ui";

export function ChannelTile({ id, size = 36, className }: { id: "linkedin" | "email" | "whatsapp"; size?: number; className?: string }) {
  const bare = BARE_LOGO.has(id);
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[24%]", bare && "bg-white ring-1 ring-stone-200", className)} style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
      <img src={CHANNEL_IMG[id]} alt="" style={{ width: bare ? "62%" : "100%", height: bare ? "62%" : "100%" }} className="object-contain" draggable={false} />
    </span>
  );
}

export function Cta({ href, children, variant = "dark", className }: { href: string; children: React.ReactNode; variant?: "dark" | "light" | "lime"; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[16px] font-semibold transition duration-300",
        variant === "dark" && "bg-stone-900 text-white hover:-translate-y-0.5 hover:bg-stone-800 hover:shadow-[0_12px_30px_-10px_rgba(28,25,23,.55)]",
        variant === "light" && "border border-stone-900/15 bg-white/70 text-stone-900 backdrop-blur hover:border-stone-900/35",
        variant === "lime" && "bg-brand-400 text-stone-900 hover:-translate-y-0.5 hover:shadow-glow",
        className,
      )}
    >
      {children}
      <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

/** Small label above a section title. */
export function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={cx("inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em]", dark ? "text-brand-300" : "text-brand-700")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dark ? "bg-brand-400" : "bg-brand-500")} aria-hidden />
      {children}
    </p>
  );
}

export const h2 = "font-display text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[52px]";
