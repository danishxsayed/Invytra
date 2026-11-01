export const CAMPAIGN_STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "Draft", cls: "bg-stone-100 text-stone-600 ring-stone-500/15" },
  SCHEDULED: { text: "Scheduled", cls: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  ACTIVE: { text: "Sending", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  PAUSED: { text: "Paused", cls: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  COMPLETED: { text: "Sent", cls: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  CANCELLED: { text: "Cancelled", cls: "bg-stone-100 text-stone-500 ring-stone-500/15 line-through" },
};

/** "Thu 5 Nov, 09:00 (Asia/Kolkata)" */
export function scheduleText(local: string | null, timeZone: string | null, recipientTz = false): string {
  if (!local || !timeZone) return "";
  const [d, t] = local.split("T");
  const day = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${day}, ${t} (${recipientTz ? "each recipient's time zone, else " : ""}${timeZone.replace(/_/g, " ")})`;
}

export const LEAD_STATUS: Record<string, { text: string; cls: string }> = {
  ACTIVE: { text: "In sequence", cls: "bg-stone-100 text-stone-700" },
  COMPLETED: { text: "All sent", cls: "bg-sky-50 text-sky-700" },
  REPLIED: { text: "Replied", cls: "bg-emerald-50 text-emerald-700" },
  BOUNCED: { text: "Bounced", cls: "bg-rose-50 text-rose-700" },
  SKIPPED: { text: "Skipped", cls: "bg-amber-50 text-amber-800" },
  UNSUBSCRIBED: { text: "Unsubscribed", cls: "bg-stone-800 text-white" },
};

export const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
