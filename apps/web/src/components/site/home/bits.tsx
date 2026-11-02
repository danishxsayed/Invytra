import { Linkedin, Mail, MessageCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cx } from "../../ui";

/** The three launch channels, with their colours. */
export const LAUNCH_CHANNELS: { id: "linkedin" | "email" | "whatsapp"; name: string; icon: LucideIcon; tile: string }[] = [
  { id: "linkedin", name: "LinkedIn", icon: Linkedin, tile: "bg-[#0A66C2] text-white" },
  { id: "email", name: "Email", icon: Mail, tile: "bg-amber-400 text-stone-900" },
  { id: "whatsapp", name: "WhatsApp", icon: MessageCircle, tile: "bg-[#25D366] text-white" },
];

export function ChannelTile({ id, size = 36, className }: { id: "linkedin" | "email" | "whatsapp"; size?: number; className?: string }) {
  const c = LAUNCH_CHANNELS.find((x) => x.id === id)!;
  return (
    <span className={cx("inline-flex shrink-0 items-center justify-center rounded-[28%]", c.tile, className)} style={{ width: size, height: size }} aria-hidden>
      <c.icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
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
