"use client";

import { EMAIL_AI_ACTIONS, EMAIL_AI_LENGTHS, EMAIL_AI_TONES, type EmailAiAction, type EmailBrief, type EmailDraft } from "@invytra/shared";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { aiEmailAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { Field, inputCls } from "../../fields";
import { Modal } from "../../Modal";
import { cx } from "../../ui";

type Email = { subject: string; body: string; preview?: string };
const EMPTY: EmailBrief = { objective: "", audience: "", product: "", tone: "professional", sellingPoints: "", cta: "", length: "short" };
const briefKey = (campaignId: string) => `invytra:email-brief:${campaignId}`;

function loadBrief(campaignId: string): EmailBrief {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(briefKey(campaignId)) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

/**
 * The AI writer for one email of the sequence: write it from a brief, or rewrite / shorten /
 * change the tone / improve the subject / get variations. Choosing a draft only puts it in
 * the editor; nothing is saved or sent until you do.
 */
export function AiWriter({ campaignId, step, current, previous, variables, onUse, onClose }: { campaignId: string; step: number; current: Email; previous?: Email; variables: string[]; onUse: (d: EmailDraft) => void; onClose: () => void }) {
  const hasEmail = !!current.body.trim();
  const [brief, setBrief] = useState<EmailBrief>(EMPTY);
  const [showBrief, setShowBrief] = useState(!hasEmail);
  const [count, setCount] = useState(2);
  const [drafts, setDrafts] = useState<EmailDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [running, setRunning] = useState<EmailAiAction | null>(null);
  useEffect(() => setBrief(loadBrief(campaignId)), [campaignId]);
  const set = <K extends keyof EmailBrief>(k: K, v: EmailBrief[K]) => {
    const b = { ...brief, [k]: v };
    setBrief(b);
    try {
      localStorage.setItem(briefKey(campaignId), JSON.stringify(b));
    } catch {
      // private window: the brief just isn't remembered
    }
  };
  const run = (action: EmailAiAction) =>
    start(async () => {
      setError(null);
      setRunning(action);
      const r = await aiEmailAction({
        action,
        step,
        variables,
        count: action === "variations" || action === "subject" ? 3 : action === "generate" ? count : 1,
        ...(action === "generate" ? { brief } : { current: { subject: current.subject, body: current.body }, ...(brief.objective && brief.audience && brief.product ? { brief } : {}) }),
        ...(previous && { previous: { subject: previous.subject, body: previous.body } }),
      });
      setRunning(null);
      if (!r.ok) return setError(r.error);
      setDrafts(r.value);
    });
  const quick: EmailAiAction[] = ["rewrite", "shorter", "professional", "friendly", ...(step === 0 ? (["subject"] as const) : []), "variations"];

  return (
    <Modal title={`Write email ${step + 1} with AI`} description="Drafts only: pick one to put it in the editor, change anything, then save. Nothing is sent from here." onClose={() => !pending && onClose()} busy={pending} wide>
      <div className="space-y-4">
        {hasEmail && (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((a) => (
              <button key={a} className={cx(btn.secondary, "py-1.5 text-[14px]")} disabled={pending} onClick={() => run(a)}>
                {running === a ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden />} {EMAIL_AI_ACTIONS[a]}
              </button>
            ))}
            <button className={cx(btn.ghost, "py-1.5 text-[14px]")} onClick={() => setShowBrief((v) => !v)}>
              {showBrief ? "Hide brief" : "Write a new one from a brief…"}
            </button>
          </div>
        )}

        {showBrief && (
          <div className="space-y-3 rounded-xl bg-stone-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Goal of the email">
                <input className={inputCls} value={brief.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Book a 15-minute call" maxLength={300} />
              </Field>
              <Field label="Who it's for">
                <input className={inputCls} value={brief.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Owners of flooring companies in the US" maxLength={300} />
              </Field>
            </div>
            <Field label="Your product or service">
              <textarea className={cx(inputCls, "min-h-[64px]")} value={brief.product} onChange={(e) => set("product", e.target.value)} placeholder="We run Meta and Google ads that bring flooring contractors booked jobs…" maxLength={1000} />
            </Field>
            <Field label="Key selling points (optional)" hint="Only real ones: the AI never invents numbers or results.">
              <textarea className={cx(inputCls, "min-h-[56px]")} value={brief.sellingPoints} onChange={(e) => set("sellingPoints", e.target.value)} placeholder="Pay per booked job, no long contract, set up in a week" maxLength={1000} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Call to action" className="sm:col-span-2">
                <input className={inputCls} value={brief.cta} onChange={(e) => set("cta", e.target.value)} placeholder="Open to a quick call this week?" maxLength={200} />
              </Field>
              <Field label="Tone">
                <select className={inputCls} value={brief.tone} onChange={(e) => set("tone", e.target.value as EmailBrief["tone"])}>
                  {EMAIL_AI_TONES.map((t) => (
                    <option key={t} value={t}>
                      {t[0]!.toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Length" hint={EMAIL_AI_LENGTHS[brief.length]}>
                <select className={inputCls} value={brief.length} onChange={(e) => set("length", e.target.value as EmailBrief["length"])}>
                  {Object.entries(EMAIL_AI_LENGTHS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k[0]!.toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={btn.primary} disabled={pending} onClick={() => run("generate")}>
                {running === "generate" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Generate
              </button>
              <select className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14px] text-stone-800" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many drafts">
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} draft{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
              {step > 0 && <span className="text-[13px] text-stone-500">Follow-up: it replies in the same thread and refers to email {step}.</span>}
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-700">{error}</p>}
        {pending && !drafts && <p className="flex items-center gap-2 text-[14px] text-stone-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Writing…</p>}
        {drafts && (
          <div className="grid gap-3">
            {drafts.map((d, i) => (
              <div key={i} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
                {d.subject && <p className="text-[15px] font-semibold text-stone-900">{d.subject}</p>}
                {d.preview && <p className="text-[13px] text-stone-500">{d.preview}</p>}
                <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-stone-800">{d.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  {d.cta ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[12.5px] text-violet-700">CTA: {d.cta}</span> : <span />}
                  <button
                    className={btn.primary}
                    onClick={() => {
                      onUse(d);
                      onClose();
                    }}
                  >
                    Use this
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
