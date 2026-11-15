"use client";

import { DIAL_CODES, waTag } from "@invytra/shared";
import { Loader2, MapPin, Plus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addWaContactAction } from "@/app/whatsapp/contacts/actions";
import { btn } from "../../btn";
import { inputCls } from "../../fields";
import { cx } from "../../ui";

const label = "block text-[14px] font-medium text-stone-700";
const req = <span className="text-rose-500"> *</span>;

/** "Add individually": one contact, with a yes/no on WhatsApp consent. */
export function AddContactForm({ suggested, onDone, onCancel }: { suggested: string[]; onDone: () => void; onCancel: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", dial: "91", local: "", userId: "", email: "", appointment: "", location: "" });
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [consent, setConsent] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const addTag = (raw: string) => {
    const t = waTag(raw);
    if (t && !tags.includes(t) && tags.length < 20) setTags([...tags, t]);
    setTagText("");
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (consent === null) return setError("Choose whether this person opted in on WhatsApp.");
        start(async () => {
          setError(null);
          const local = f.local.replace(/\D/g, "").replace(/^0+/, "");
          const r = await addWaContactAction({ name: f.name, phone: `+${f.dial}${local}`, userId: f.userId, email: f.email, tags: tagText.trim() ? [...tags, waTag(tagText)] : tags, consent, appointment: f.appointment, location: f.location });
          if (!r.ok) return setError(r.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <label className="block">
          <span className={label}>Name{req}</span>
          <input className={inputCls} value={f.name} onChange={set("name")} placeholder="e.g. Priya Sharma" required maxLength={160} autoFocus />
        </label>
        <div>
          <span className={label}>Phone number{req}</span>
          <div className="mt-1.5 flex gap-2">
            <span className="w-[120px] shrink-0">
            <select className={cx(inputCls, "mt-0")} value={f.dial} onChange={set("dial")} aria-label="Country code">
              {DIAL_CODES.map((c) => (
                <option key={c.iso} value={c.dial}>
                  {c.iso} +{c.dial}
                </option>
              ))}
            </select>
            </span>
            <input className={cx(inputCls, "mt-0")} value={f.local} onChange={set("local")} placeholder="98765 43210" inputMode="tel" required aria-label="Phone number" />
          </div>
          <p className="mt-1 text-[13px] text-stone-500">Local number without the leading 0, e.g. 98765 43210</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>User ID</span>
            <input className={cx(inputCls, "font-mono text-[15px]")} value={f.userId} onChange={set("userId")} placeholder="Your CRM or app ID" maxLength={120} />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input className={inputCls} type="email" value={f.email} onChange={set("email")} placeholder="name@example.com" />
          </label>
        </div>
        <div>
          <span className={label}>Tags</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-200">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[13.5px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-emerald-600 hover:text-emerald-900">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
            <input
              className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-[15px] outline-none placeholder:text-stone-400"
              value={tagText}
              onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value.slice(0, -1)) : setTagText(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagText.trim()) {
                  e.preventDefault();
                  addTag(tagText);
                } else if (e.key === "Backspace" && !tagText && tags.length) setTags(tags.slice(0, -1));
              }}
              placeholder={tags.length ? "" : "Type a tag and press Enter or comma"}
              aria-label="Tags"
            />
          </div>
          {suggested.filter((s) => !tags.includes(s)).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-stone-500">
              Suggested
              {suggested
                .filter((s) => !tags.includes(s))
                .slice(0, 6)
                .map((s) => (
                  <button key={s} type="button" onClick={() => addTag(s)} className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-stone-300 px-2 py-0.5 text-stone-700 hover:border-emerald-400 hover:text-emerald-800">
                    <Plus className="h-3 w-3" aria-hidden /> {s}
                  </button>
                ))}
            </div>
          )}
        </div>
        <div>
          <span className={label}>WhatsApp opted in{req}</span>
          <p className="mt-1 text-[13.5px] text-stone-500">
            Choose <strong className="text-stone-800">Yes</strong> only if the number is on WhatsApp and the person agreed to get messages from your business. Campaigns only message people who opted in.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="WhatsApp opted in">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={consent === v}
                onClick={() => setConsent(v)}
                className={cx("flex items-center gap-3 rounded-xl px-4 py-3.5 text-left text-[15px] ring-1 transition", consent === v ? "bg-emerald-50 font-medium text-stone-900 ring-2 ring-emerald-500" : "bg-white text-stone-700 ring-stone-200 hover:ring-stone-300")}
              >
                <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2", consent === v ? "ring-emerald-600" : "ring-stone-300")}>{consent === v && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}</span>
                {v ? "Yes, confirmed on WhatsApp" : "No"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Appointment time</span>
            <input className={inputCls} type="datetime-local" value={f.appointment} onChange={set("appointment")} />
          </label>
          <label className="block">
            <span className={label}>Location</span>
            <span className="relative block">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 mt-[3px] h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input className={cx(inputCls, "pl-9")} value={f.location} onChange={set("location")} placeholder="City, State" maxLength={200} />
            </span>
          </label>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
            {error}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[1fr_1.5fr] gap-3 border-t border-stone-100 px-6 py-4">
        <button type="button" className={btn.secondary} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={btn.primary} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />} Add contact
        </button>
      </div>
    </form>
  );
}
