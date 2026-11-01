"use client";

import { BUILT_IN_VARS, EMAIL_CAMPAIGN, renderEmailText, unknownVars, type EmailRecipientVars, type EmailStep } from "@invytra/shared";
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { AiWriter } from "./AiWriter";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveEmailSequenceAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { inputCls } from "../../fields";
import { cx } from "../../ui";

type Target = { step: number; field: "subject" | "body" };

/** The emails of the sequence, with variables and a preview for real leads. */
export function SequenceEditor({ id, initial, columns, sample, editable }: { id: string; initial: EmailStep[]; columns: string[]; sample: EmailRecipientVars[]; editable: boolean }) {
  const router = useRouter();
  const [steps, setSteps] = useState<EmailStep[]>(initial.length ? initial : [{ subject: "", body: "", delayDays: 0 }]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [who, setWho] = useState(0);
  const [ai, setAi] = useState<number | null>(null);
  const focus = useRef<Target>({ step: 0, field: "body" });
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());

  const set = (i: number, patch: Partial<EmailStep>) => {
    setSaved(false);
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const insert = (v: string) => {
    const { step, field } = focus.current;
    const el = fields.current.get(`${step}.${field}`);
    const cur = steps[step]?.[field] ?? "";
    const at = el?.selectionStart ?? cur.length;
    const token = v === "first_name" ? "{{first_name|there}}" : `{{${v}}}`;
    set(step, { [field]: cur.slice(0, at) + token + cur.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const unknown = unknownVars(steps, columns);
  const lead = sample[who];
  const vars = [...BUILT_IN_VARS, ...columns];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {editable && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-stone-500">Insert:</span>
            {vars.map((v) => (
              <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(v)} className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-[12.5px] text-stone-700 hover:bg-stone-200">
                {`{{${v}}}`}
              </button>
            ))}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("random:Hi|Hello|Hey")} className="rounded-md bg-violet-50 px-2 py-0.5 font-mono text-[12.5px] text-violet-700 hover:bg-violet-100">
              {"{{random:Hi|Hello|Hey}}"}
            </button>
            <a href="/email/contacts?tab=variables" className="ml-1 text-[12.5px] text-stone-500 underline-offset-2 hover:underline">
              Manage variables
            </a>
          </div>
        )}
        {steps.map((s, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-stone-900">Email {i + 1}</span>
              {i > 0 && (
                <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[14px] text-stone-600">
                  · send
                  <input
                    type="number"
                    min={1}
                    max={EMAIL_CAMPAIGN.maxDelayDays}
                    disabled={!editable}
                    value={s.delayDays}
                    onChange={(e) => set(i, { delayDays: Number(e.target.value) })}
                    aria-label={`Days before email ${i + 1}`}
                    className="h-8 w-16 rounded-lg border border-stone-200 bg-white px-2 text-center text-[14px] text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 disabled:bg-stone-50"
                  />
                  days after email {i}, if no reply
                </span>
              )}
              {editable && (
                <button type="button" className={cx(btn.secondary, "ml-auto border-violet-200 px-2.5 py-1 text-[13.5px] text-violet-700 hover:bg-violet-50")} onClick={() => setAi(i)}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Write with AI
                </button>
              )}
              {editable && steps.length > 1 && (
                <button type="button" className={cx(btn.ghost, "px-2 py-1")} onClick={() => (setSaved(false), setSteps(steps.filter((_, j) => j !== i)))} aria-label={`Remove email ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <input
              ref={(el) => void (el && fields.current.set(`${i}.subject`, el))}
              className={inputCls}
              value={s.subject}
              disabled={!editable}
              maxLength={EMAIL_CAMPAIGN.subjectMax}
              onFocus={() => (focus.current = { step: i, field: "subject" })}
              onChange={(e) => set(i, { subject: e.target.value })}
              placeholder={i === 0 ? "Subject" : "Leave empty to reply in the same thread (Re: …)"}
            />
            <input
              className={cx(inputCls, "mt-2 py-2 text-[14px]")}
              value={s.preview ?? ""}
              disabled={!editable}
              maxLength={150}
              onChange={(e) => set(i, { preview: e.target.value })}
              placeholder="Preview text (optional): the line inboxes show after the subject"
            />
            <textarea
              ref={(el) => void (el && fields.current.set(`${i}.body`, el))}
              className={cx(inputCls, "mt-2 min-h-[150px]")}
              value={s.body}
              disabled={!editable}
              maxLength={EMAIL_CAMPAIGN.bodyMax}
              onFocus={() => (focus.current = { step: i, field: "body" })}
              onChange={(e) => set(i, { body: e.target.value })}
              placeholder="Write your email. The mailbox's signature is added below it."
            />
          </div>
        ))}
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            {steps.length < EMAIL_CAMPAIGN.maxSteps && (
              <button type="button" className={btn.secondary} onClick={() => (setSaved(false), setSteps([...steps, { subject: "", body: "", delayDays: 3 }]))}>
                <Plus className="h-4 w-4" aria-hidden /> Add follow-up
              </button>
            )}
            <button
              className={btn.primary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await saveEmailSequenceAction(id, steps);
                  if (!r.ok) return setError(r.error);
                  setSaved(true);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save emails
            </button>
            {saved && <span className="text-[14px] text-emerald-700">Saved</span>}
          </div>
        )}
        {unknown.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {unknown.map((u) => `{{${u}}}`).join(", ")} isn't a variable yet. Create it under Contacts → Variables, import a CSV column with that name, or remove it.
          </p>
        )}
        {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
      </div>

      {ai !== null && (
        <AiWriter
          campaignId={id}
          step={ai}
          current={steps[ai]!}
          previous={ai > 0 ? steps[ai - 1] : undefined}
          variables={columns}
          onUse={(d) => set(ai, { ...(ai === 0 || d.subject ? { subject: d.subject } : {}), body: d.body, preview: d.preview })}
          onClose={() => setAi(null)}
        />
      )}
      <aside className="h-fit rounded-xl border border-stone-200 bg-stone-50/60 p-4 lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-stone-900">Preview</span>
          {sample.length > 0 && (
            <select className={cx(inputCls, "h-8 w-auto max-w-[220px] px-2 py-1 text-[13px]")} value={who} onChange={(e) => setWho(Number(e.target.value))}>
              {sample.map((l, i) => (
                <option key={l.email} value={i}>
                  {l.email}
                </option>
              ))}
            </select>
          )}
        </div>
        {!lead ? (
          <p className="text-[14px] text-stone-500">Add leads to see each email as they'll get it.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((s, i) => {
              const first = renderEmailText(steps[0]?.subject ?? "", lead, () => 0);
              const subj = s.subject || i === 0 ? renderEmailText(s.subject, lead, () => 0) : first.ok ? { ok: true as const, text: `Re: ${first.text}` } : first;
              const body = renderEmailText(s.body, lead, () => 0);
              const missing = [...(subj.ok ? [] : subj.missing), ...(body.ok ? [] : body.missing)];
              return (
                <div key={i} className="rounded-lg bg-white p-3 ring-1 ring-stone-200">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-stone-400">Email {i + 1}</p>
                  {missing.length ? (
                    <p className="mt-1 text-[13px] text-amber-800">Not sent to this lead: no value for {missing.map((m) => `{{${m}}}`).join(", ")}. Add a fallback, like {`{{${missing[0]}|there}}`}, or a default under Contacts → Variables.</p>
                  ) : (
                    <>
                      <p className="mt-1 text-[14px] font-semibold text-stone-900">{(subj as { text: string }).text}</p>
                      {s.preview && <p className="text-[12.5px] text-stone-500">{(() => { const p = renderEmailText(s.preview, lead, () => 0); return p.ok ? p.text : s.preview; })()}</p>}
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-stone-700">{(body as { text: string }).text}</p>
                    </>
                  )}
                </div>
              );
            })}
            <p className="text-[12px] text-stone-500">{"{{random:…}}"} picks one option per email; the preview shows the first.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
