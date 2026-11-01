"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCampaignMailboxesAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { cx } from "../../ui";

export interface PickerMailbox {
  id: string;
  email: string;
  status: string;
  dailyLimit: number;
  warmupDay: number | null;
}

/** Which mailboxes send this campaign; new leads go to the one with the most room today. */
export function MailboxPicker({ id, mailboxes, chosen }: { id: string; mailboxes: PickerMailbox[]; chosen: string[] }) {
  const router = useRouter();
  const [sel, setSel] = useState(new Set(chosen));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = sel.size !== chosen.length || chosen.some((c) => !sel.has(c));
  const perDay = mailboxes.filter((m) => sel.has(m.id)).reduce((a, m) => a + m.dailyLimit, 0);
  if (!mailboxes.length) return <p className="text-[15px] text-stone-600">No mailboxes yet. Connect one on the Mailboxes tab first.</p>;
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {mailboxes.map((m) => {
          const on = sel.has(m.id);
          return (
            <li key={m.id}>
              <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition", on ? "border-brand-500 bg-brand-50" : "border-stone-200 hover:border-stone-300")}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-lime-500"
                  checked={on}
                  onChange={() => {
                    const n = new Set(sel);
                    if (on) n.delete(m.id);
                    else n.add(m.id);
                    setSel(n);
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-stone-900">{m.email}</span>
                  <span className="block text-[13px] text-stone-500">
                    {m.dailyLimit} a day
                    {m.status !== "ACTIVE" && <span className="text-amber-700"> · {m.status === "PAUSED" ? "paused" : "needs attention"}</span>}
                    {m.warmupDay !== null && m.warmupDay < 14 && <span className="text-orange-700"> · warming up, day {m.warmupDay}</span>}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={btn.primary}
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await setCampaignMailboxesAction(id, [...sel]);
              if (!r.ok) return setError(r.error);
              router.refresh();
            })
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save mailboxes
        </button>
        <span className="text-[14px] text-stone-500">
          {sel.size} mailbox{sel.size === 1 ? "" : "es"} · up to {perDay} emails a day in total (follow-ups included)
        </span>
      </div>
      {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
    </div>
  );
}
