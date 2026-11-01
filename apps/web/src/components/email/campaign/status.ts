export const CAMPAIGN_STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "Draft", cls: "bg-stone-100 text-stone-600 ring-stone-500/15" },
  ACTIVE: { text: "Running", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  PAUSED: { text: "Paused", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  COMPLETED: { text: "Finished", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
};

export const LEAD_STATUS: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: "In sequence", cls: "bg-stone-100 text-stone-700" },
  COMPLETED: { text: "All sent", cls: "bg-sky-50 text-sky-700" },
  REPLIED: { text: "Replied", cls: "bg-emerald-50 text-emerald-700" },
  BOUNCED: { text: "Bounced", cls: "bg-rose-50 text-rose-700" },
  SKIPPED: { text: "Skipped", cls: "bg-amber-50 text-amber-800" },
  UNSUBSCRIBED: { text: "Unsubscribed", cls: "bg-stone-800 text-white" },
};

export const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
