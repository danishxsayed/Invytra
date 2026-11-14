"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addWaContactAction } from "@/app/whatsapp/contacts/actions";
import { btn } from "../../btn";
import { Field, inputCls } from "../../fields";
import { Modal } from "../../Modal";

const EMPTY = { phone: "", firstName: "", lastName: "", email: "", company: "", tags: "", consent: false };

/** Add one contact by hand (with consent confirmed). */
export function AddWaContact() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <>
      <button type="button" className={btn.secondary} onClick={() => (setF(EMPTY), setError(null), setOpen(true))}>
        <UserPlus className="h-4 w-4" aria-hidden /> Add contact
      </button>
      {open && (
        <Modal title="Add a contact" onClose={() => !pending && setOpen(false)} busy={pending}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addWaContactAction({ ...f, consent: f.consent || undefined });
                if (!r.ok) return setError(r.error);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field label="WhatsApp number" hint="With the country code, like +971 50 123 4567.">
              <input className={inputCls} value={f.phone} onChange={set("phone")} placeholder="+971 50 123 4567" inputMode="tel" autoFocus required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <input className={inputCls} value={f.firstName} onChange={set("firstName")} />
              </Field>
              <Field label="Last name">
                <input className={inputCls} value={f.lastName} onChange={set("lastName")} />
              </Field>
              <Field label="Company">
                <input className={inputCls} value={f.company} onChange={set("company")} />
              </Field>
              <Field label="Email">
                <input className={inputCls} type="email" value={f.email} onChange={set("email")} />
              </Field>
            </div>
            <Field label="Tags" hint="Comma separated, like dubai, warm.">
              <input className={inputCls} value={f.tags} onChange={set("tags")} />
            </Field>
            <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-[14px] text-stone-700 ring-1 ring-stone-200">
              <input type="checkbox" className="mt-1 accent-lime-500" checked={f.consent} onChange={set("consent")} />
              <span>This person agreed to get WhatsApp messages from my business. WhatsApp requires it, and messaging people who didn&apos;t agree gets numbers blocked.</span>
            </label>
            {error && (
              <p role="alert" className="text-[14px] text-rose-700">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <button type="submit" className={btn.primary} disabled={pending || !f.consent}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Add contact
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
