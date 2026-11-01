"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveEmailCampaignSettingsAction } from "@/app/email/campaigns/actions";
import type { EmailCampaignSettings } from "@/lib/email-campaigns";
import { btn } from "../../AccountControls";
import { Field, Toggle, inputCls } from "../../fields";

/** Unsubscribe line (on/off, wording) and how soft bounces are retried. */
export function CampaignSettings({ id, initial }: { id: string; initial: EmailCampaignSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const m = /\[([^\]]+)\]/.exec(s.unsubscribeText);
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Toggle
          checked={s.unsubscribeLink}
          onChange={(v) => setS({ ...s, unsubscribeLink: v })}
          label="Show an unsubscribe link in every email"
          hint="Mail providers also get a one-click unsubscribe header either way, so Gmail and Outlook can show their own Unsubscribe button. Off suits plain 1-to-1 cold email."
        />
        {s.unsubscribeLink && (
          <>
            <Field label="Unsubscribe line" hint="Put the linked words in [brackets]. It goes at the bottom, or where an email says {{unsubscribe}}.">
              <input className={inputCls} value={s.unsubscribeText} onChange={(e) => setS({ ...s, unsubscribeText: e.target.value })} maxLength={300} />
            </Field>
            <p className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] text-stone-500">
              Looks like:{" "}
              {m ? (
                <>
                  {s.unsubscribeText.slice(0, m.index)}
                  <span className="text-sky-700 underline">{m[1]}</span>
                  {s.unsubscribeText.slice(m.index + m[0].length)}
                </>
              ) : (
                <span className="text-sky-700 underline">{s.unsubscribeText}</span>
              )}
            </p>
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Soft bounces: try again" hint="Mailbox full, server busy… (0–5 times). Hard bounces are never retried.">
          <input type="number" className={inputCls} min={0} max={5} value={s.softBounceRetries} onChange={(e) => setS({ ...s, softBounceRetries: Number(e.target.value) })} />
        </Field>
        <Field label="Hours between tries" hint="1–72.">
          <input type="number" className={inputCls} min={1} max={72} value={s.softRetryHours} onChange={(e) => setS({ ...s, softRetryHours: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button
          className={btn.primary}
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveEmailCampaignSettingsAction(id, s);
              setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save settings
        </button>
        {msg && <span className={msg.ok ? "text-[14px] text-emerald-700" : "text-[14px] text-rose-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
