"use client";

import { Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockPersonAction, updatePersonAction } from "@/app/workspace/contacts/actions";
import { btn } from "../AccountControls";

export interface PersonFields {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  notes: string;
}

const input = "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] focus:border-stone-500 focus:outline-none";
const label = "block text-[13.5px] font-medium text-stone-700";

/** Edit a contact's details (phone and notes are only kept here). */
export function PersonForm({ id, value }: { id: string; value: PersonFields }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const f = (k: keyof PersonFields) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updatePersonAction(id, v);
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className={label}>
        First name
        <input className={input} maxLength={80} {...f("firstName")} />
      </label>
      <label className={label}>
        Last name
        <input className={input} maxLength={80} {...f("lastName")} />
      </label>
      <label className={label}>
        Company
        <input className={input} maxLength={120} {...f("company")} />
      </label>
      <label className={label}>
        Job title
        <input className={input} maxLength={150} {...f("title")} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Phone
        <input className={input} type="tel" maxLength={30} placeholder="+91 98765 43210" {...f("phone")} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Notes
        <textarea className={input} rows={3} maxLength={5000} placeholder="Anything your team should know" {...f("notes")} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save
        </button>
        {msg && <p className={msg.ok ? "text-[14px] text-emerald-700" : "text-[14px] text-rose-700"}>{msg.text}</p>}
      </div>
    </form>
  );
}

/** Stops this person on every channel, for good. */
export function BlockPerson({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="text-[14px] text-stone-600">{done}</p>;
  return (
    <button
      type="button"
      disabled={busy}
      className={btn.secondary}
      onClick={() => {
        if (!confirm("Never contact this person again, on any channel? They'll be stopped in running campaigns.")) return;
        start(async () => {
          const r = await blockPersonAction(id);
          setDone(r.ok ? `On the do-not-contact list.${r.value ? ` Stopped in ${r.value} campaign${r.value === 1 ? "" : "s"}.` : ""}` : r.error);
          router.refresh();
        });
      }}
    >
      <Ban className="h-4 w-4 text-rose-600" aria-hidden /> Do not contact
    </button>
  );
}
