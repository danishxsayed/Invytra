"use client";

import { readMetaComponents, templateNeeds } from "@invytra/shared";
import { FileText, Loader2, Send, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { sendTemplateAction } from "@/app/whatsapp/inbox/actions";
import { btn } from "../../btn";
import { Portal } from "../../Portal";
import { cx } from "../../ui";
import { WaBubble } from "../WaBubble";

export interface InboxTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
}

/** Pick an approved template and fill its variables (first name filled in for you), then send. */
export function TemplateSend({ chatId, templates, firstName, onClose, onSent }: { chatId: string; templates: InboxTemplate[]; firstName: string; onClose: () => void; onSent: () => void }) {
  const [id, setId] = useState(templates[0]?.id ?? "");
  const t = templates.find((x) => x.id === id);
  const needs = useMemo(() => (t ? templateNeeds(t.components) : null), [t]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mediaUrl, setMediaUrl] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const val = (slot: string) => values[`${id}:${slot}`] ?? (slot === "body:1" || slot === "header" ? firstName : "");
  const view = t ? readMetaComponents(t.components) : null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Send a template">
        <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-start gap-4 px-6 pb-4 pt-6">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1">
              <h2 className="text-[19px] font-semibold text-stone-900">Send a template</h2>
              <p className="text-[14px] text-stone-500">Templates can be sent any time; free-form replies only within 24 hours of their last message.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full ring-1 ring-stone-200 hover:bg-stone-50">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {!templates.length ? (
            <p className="px-6 pb-8 text-[15px] text-stone-600">
              No approved templates yet.{" "}
              <a href="/whatsapp/templates/new" className="font-medium text-emerald-700 underline">
                Create one
              </a>{" "}
              and send it once Meta approves it.
            </p>
          ) : (
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto border-t border-stone-100 px-6 py-5 md:grid-cols-[1fr_300px]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[14px] font-medium text-stone-700">Template</span>
                  <select className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-[15px]" value={id} onChange={(e) => setId(e.target.value)}>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.language} · {x.category.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                {needs?.media && (
                  <label className="block">
                    <span className="text-[14px] font-medium text-stone-700">Link to the header {needs.media.toLowerCase()}</span>
                    <input className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-[15px]" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…" />
                  </label>
                )}
                {needs?.slots.map((s) => (
                  <label key={s.slot} className="block">
                    <span className="text-[14px] font-medium text-stone-700">{s.label}</span>
                    <input className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 text-[15px]" value={val(s.slot)} onChange={(e) => setValues({ ...values, [`${id}:${s.slot}`]: e.target.value })} />
                  </label>
                ))}
                {needs && !needs.slots.length && !needs.media && <p className="text-[14px] text-stone-500">Nothing to fill in: it&apos;s sent as it is.</p>}
              </div>
              {view && (
                <div className="rounded-2xl bg-[#efe7dd] p-3">
                  <WaBubble
                    t={{ header: view.header.type === "TEXT" ? { type: "TEXT", text: view.header.text } : view.header.type === "NONE" ? { type: "NONE" } : { type: view.header.type }, body: view.body, footer: view.footer, buttons: view.buttons }}
                    values={(needs?.slots ?? []).filter((s) => s.slot.startsWith("body:")).reduce<string[]>((a, s) => ((a[Number(s.slot.slice(5)) - 1] = val(s.slot)), a), [])}
                    headerValue={val("header")}
                  />
                </div>
              )}
            </div>
          )}
          {error && <p className="mx-6 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-stone-100 px-6 py-4">
            <button type="button" className={btn.secondary} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!t || pending}
              className={cx(btn.primary, "px-5")}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await sendTemplateAction(chatId, { templateId: id, values: Object.fromEntries((needs?.slots ?? []).map((s) => [s.slot, val(s.slot)])), mediaUrl });
                  if (!r.ok) return setError(r.error);
                  onSent();
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send template
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
