"use client";

import { Check, Copy, Loader2, RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectNumberAction, refreshNumberAction, saveProfileAction } from "@/app/whatsapp/actions";
import { btn } from "../AccountControls";
import { Field, inputCls } from "../fields";
import { cx } from "../ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) =>
  msg && (
    <p role={msg.ok ? "status" : "alert"} className={cx("rounded-lg px-3 py-2 text-[14px]", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
      {msg.text}
    </p>
  );

/** "Check status" next to the number. */
export function RefreshNumber() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshNumberAction();
            setMsg(r.ok ? null : { ok: false, text: r.error });
            router.refresh();
          })
        }
        className={btn.secondary}
      >
        <RefreshCw className={cx("h-4 w-4", pending && "animate-spin")} aria-hidden /> Check status
      </button>
      <Note msg={msg} />
    </div>
  );
}

/** A Meta id with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[13px] font-medium text-stone-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-50 px-3 py-2 font-mono text-[13.5px] text-stone-700 ring-1 ring-stone-200">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg p-2 text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Disconnect (owner only, with a confirmation). The number stays on the customer's Meta account. */
export function DisconnectNumber({ phone }: { phone: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-2">
      {ask ? (
        <div className="rounded-xl bg-rose-50 p-4 text-[14px] text-rose-900 ring-1 ring-rose-200">
          <p>
            Disconnect <strong>{phone}</strong> from Invytra? Campaigns stop and its templates are removed from this list. The number and its templates stay in your Meta account, and you can connect it again later.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await disconnectNumberAction();
                  if (!r.ok) return setMsg({ ok: false, text: r.error });
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[14px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Disconnect
            </button>
            <button type="button" onClick={() => setAsk(false)} className={btn.ghost}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsk(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
          <Unplug className="h-4 w-4" aria-hidden /> Disconnect number
        </button>
      )}
      <Note msg={msg} />
    </div>
  );
}

type Profile = { about: string; description: string; email: string; address: string; website: string };

/** The public business profile people see in WhatsApp. */
export function ProfileForm({ initial }: { initial: Profile }) {
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveProfileAction(p);
          setMsg(r.ok ? { ok: true, text: "Saved. WhatsApp shows the new profile within a few minutes." } : { ok: false, text: r.error });
        });
      }}
    >
      <Field label="Status line" hint={`${p.about.length} / 139`}>
        <input className={inputCls} value={p.about} onChange={set("about")} maxLength={139} placeholder="Helping teams grow with outreach" />
      </Field>
      <Field label="Description" hint={`${p.description.length} / 512`}>
        <textarea className={cx(inputCls, "min-h-[96px]")} value={p.description} onChange={set("description")} maxLength={512} placeholder="What your business does, in a sentence or two." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input className={inputCls} type="email" value={p.email} onChange={set("email")} placeholder="hello@company.com" />
        </Field>
        <Field label="Website">
          <input className={inputCls} value={p.website} onChange={set("website")} placeholder="https://company.com" />
        </Field>
      </div>
      <Field label="Address">
        <input className={inputCls} value={p.address} onChange={set("address")} placeholder="Office, city, country" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btn.primary}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save profile
        </button>
        <Note msg={msg} />
      </div>
    </form>
  );
}
