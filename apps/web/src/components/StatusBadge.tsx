const STYLES: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-pine-soft text-pine" },
  PAUSED: { label: "Paused", cls: "bg-amber-soft text-amber" },
  NEEDS_ATTENTION: { label: "Needs attention", cls: "bg-rose-soft text-rose" },
  DISCONNECTED: { label: "Not connected", cls: "bg-line text-ink-soft" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, cls: "bg-line text-ink-soft" };
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-medium ${s.cls}`}>{s.label}</span>;
}

export function OutcomeDot({ status }: { status: string }) {
  const cls =
    status === "SUCCEEDED" ? "bg-pine" : status === "FAILED" ? "bg-rose" : status === "SKIPPED" ? "bg-ink-faint" : "bg-amber";
  return <span aria-hidden className={`mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}
