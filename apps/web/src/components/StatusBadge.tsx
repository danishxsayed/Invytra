import { cx } from "./ui";

const ACCOUNT: Record<string, { label: string; dot: string; cls: string }> = {
  ACTIVE: { label: "Connected", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  PAUSED: { label: "Paused", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700 ring-amber-600/15" },
  NEEDS_ATTENTION: { label: "Needs attention", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700 ring-rose-600/15" },
  DISCONNECTED: { label: "Not connected", dot: "bg-stone-400", cls: "bg-stone-100 text-stone-600 ring-stone-500/15" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = ACCOUNT[status] ?? ACCOUNT.DISCONNECTED!;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium ring-1 ring-inset", s.cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function accountDot(status: string): string {
  return (ACCOUNT[status] ?? ACCOUNT.DISCONNECTED!).dot;
}

const OUTCOME: Record<string, string> = {
  SUCCEEDED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700",
  SKIPPED: "bg-stone-100 text-stone-600",
  QUEUED: "bg-amber-50 text-amber-700",
  RUNNING: "bg-brand-100 text-brand-800",
};

export function OutcomePill({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[13px] font-medium", OUTCOME[status] ?? OUTCOME.QUEUED)}>
      {children}
    </span>
  );
}
