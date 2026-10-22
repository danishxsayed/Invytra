import type { LucideIcon } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-2xl border border-zinc-200/80 bg-white shadow-card", className)}>{children}</div>;
}

export function CardHeader({
  title,
  icon: Icon,
  action,
  description,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
      <div className="flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 text-zinc-400" aria-hidden />}
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          {description && <p className="text-[13px] text-zinc-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const PALETTE = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sz = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sz, PALETTE[h % PALETTE.length])}
    >
      {initials(name)}
    </span>
  );
}

export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const full = used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-zinc-500">{label}</span>
        <span className="tabular font-medium text-zinc-900">
          {used}
          <span className="text-zinc-400">/{limit}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div
          className={cx("h-full rounded-full", full ? "bg-amber-400" : "bg-gradient-to-r from-brand-400 to-brand-600")}
          style={{ width: `${Math.max(pct, used > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 font-medium text-zinc-900">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
