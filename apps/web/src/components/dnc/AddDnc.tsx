"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDncAction } from "@/app/workspace/do-not-contact/actions";
import { btn } from "../AccountControls";

/** Paste anyone who must never be contacted: one per line (LinkedIn profile, email, domain or company). */
export function AddDnc() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addDncAction(text, note);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          const v = r.value;
          const parts = [`Added ${v.added}`, v.alreadyThere ? `${v.alreadyThere} already on the list` : "", v.unreadable.length ? `couldn't read: ${v.unreadable.slice(0, 3).join(", ")}${v.unreadable.length > 3 ? "…" : ""}` : ""].filter(Boolean);
          const stopped = v.stopped.linkedin + v.stopped.email;
          setMsg({ ok: true, text: `${parts.join(" · ")}.${stopped ? ` Stopped ${stopped} ${stopped === 1 ? "person" : "people"} in running campaigns (LinkedIn ${v.stopped.linkedin}, Email ${v.stopped.email}).` : ""}` });
          setText("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        required
        aria-label="Entries to add"
        placeholder={"One per line, for example:\nhttps://www.linkedin.com/in/jane-doe\nbob@competitor.com\ncompetitor.com\nAcme Inc"}
        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 font-mono text-[14px] leading-relaxed focus:border-stone-500 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Why (optional), e.g. Existing customer" aria-label="Note" className="min-w-[220px] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] focus:border-stone-500 focus:outline-none" />
        <button type="submit" className={btn.primary} disabled={busy || !text.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Add to list
        </button>
      </div>
      {msg && <p className={msg.ok ? "text-[14px] text-emerald-700" : "text-[14px] text-rose-700"}>{msg.text}</p>}
    </form>
  );
}
