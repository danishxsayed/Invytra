"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addSuppressionsAction, removeSuppressionAction } from "@/app/email/contacts/actions";
import { btn } from "../../AccountControls";
import { inputCls } from "../../fields";
import { cx } from "../../ui";

const REASON: Record<string, string> = { UNSUBSCRIBED: "Unsubscribed", HARD_BOUNCE: "Hard bounce", COMPLAINT: "Spam complaint", MANUAL: "Added by you" };

/** Addresses (or whole domains) never emailed by any campaign. */
export function SuppressionPanel({ rows }: { rows: { id: string; email: string; reason: string; detail: string | null; createdAt: Date }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-stone-50 p-4">
        <textarea className={cx(inputCls, "mt-0 min-h-[70px] text-[14px]")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Addresses or whole domains, e.g. ceo@rival.com, @rival.com" />
        <div className="mt-2 flex items-center gap-3">
          <button
            className={btn.primary}
            disabled={pending || !text.trim()}
            onClick={() =>
              start(async () => {
                const r = await addSuppressionsAction(text);
                if (!r.ok) return setNote(r.error);
                setNote(`Added ${r.value.added}${r.value.invalid ? ` · ${r.value.invalid} weren't addresses or domains` : ""}.`);
                setText("");
                router.refresh();
              })
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Never email these
          </button>
          {note && <span className="text-[14px] text-stone-600">{note}</span>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-[14px] text-stone-500">Nobody yet. Unsubscribes and hard bounces are added here automatically.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-stone-50 text-[12.5px] text-stone-500">
              <tr>
                <th className="px-3 py-2 font-medium">Address or domain</th>
                <th className="px-3 py-2 font-medium">Why</th>
                <th className="px-3 py-2 font-medium">Since</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-stone-900">{r.email}</td>
                  <td className="px-3 py-2 text-stone-600">
                    {REASON[r.reason]}
                    {r.detail && <span className="block max-w-[320px] truncate text-[12.5px] text-stone-400">{r.detail}</span>}
                  </td>
                  <td className="px-3 py-2 text-stone-500">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-3 py-2 text-right">
                    {r.reason !== "HARD_BOUNCE" && (
                      <button className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={`Remove ${r.email}`} onClick={() => start(async () => void ((await removeSuppressionAction(r.id)).ok && router.refresh()))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
