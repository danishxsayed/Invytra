"use client";

import {
  WA_CATEGORIES,
  WA_CATEGORY_INFO,
  WA_LANGUAGES,
  WA_LIMITS,
  checkTemplate,
  nextVariable,
  waTemplateName,
  waVariables,
  type WaButton,
  type WaTemplateDraft,
} from "@invytra/shared";
import { ArrowLeft, Bold, ExternalLink, ImagePlus, Italic, Loader2, Phone, Plus, Reply, Send, Trash2, Variable } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { createTemplateAction, uploadHeaderImageAction } from "@/app/whatsapp/actions";
import { btn } from "../AccountControls";
import { Field, inputCls } from "../fields";
import { cx } from "../ui";
import { WaBubble, WaChatBackground } from "./WaBubble";

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
    <h2 className="text-[16px] font-semibold text-stone-900">{title}</h2>
    {hint && <p className="mt-0.5 text-[14px] text-stone-500">{hint}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

/** Build a template, see it as WhatsApp shows it, and submit it to Meta for review. */
export function TemplateBuilder({ initial, business }: { initial: WaTemplateDraft; business: string }) {
  const router = useRouter();
  const [t, setT] = useState<WaTemplateDraft>(initial);
  const [rawName, setRawName] = useState(initial.name);
  const [imgPreview, setImgPreview] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const errors = useMemo(() => checkTemplate(t), [t]);
  const bodyVars = [...new Set(waVariables(t.body))].sort((a, b) => a - b);
  const set = (p: Partial<WaTemplateDraft>) => setT((x) => ({ ...x, ...p }));

  /** Wraps the selection in *…* or _…_, or inserts the next {{n}}. */
  const edit = (kind: "bold" | "italic" | "var") => {
    const el = body.current;
    const [a, b] = el ? [el.selectionStart, el.selectionEnd] : [t.body.length, t.body.length];
    const sel = t.body.slice(a, b);
    const ins = kind === "var" ? `{{${nextVariable(t.body)}}}` : kind === "bold" ? `*${sel || "bold"}*` : `_${sel || "italic"}_`;
    const next = t.body.slice(0, a) + ins + t.body.slice(b);
    if (next.length <= WA_LIMITS.body) set({ body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + ins.length, a + ins.length);
    });
  };

  const setButton = (i: number, b: WaButton) => set({ buttons: t.buttons.map((x, j) => (j === i ? b : x)) });
  const addButton = (type: WaButton["type"]) =>
    set({ buttons: [...t.buttons, type === "QUICK_REPLY" ? { type, text: "" } : type === "URL" ? { type, text: "", url: "https://" } : { type, text: "Call us", phone: "" }] });
  const count = (type: WaButton["type"]) => t.buttons.filter((b) => b.type === type).length;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErr(null);
    const form = new FormData();
    form.set("file", file);
    const r = await uploadHeaderImageAction(form);
    setUploading(false);
    if (!r.ok) return setErr(r.error);
    setImgPreview(URL.createObjectURL(file));
    set({ header: { type: "IMAGE", handle: r.value.handle } });
  };

  const submit = () => {
    setTried(true);
    if (errors.length) return;
    start(async () => {
      const r = await createTemplateAction(t);
      if (!r.ok) return setErr(r.error);
      router.push("/whatsapp/templates");
      router.refresh();
    });
  };

  const preview = {
    header: t.header.type === "TEXT" ? { type: "TEXT" as const, text: t.header.text } : t.header.type === "IMAGE" ? { type: "IMAGE" as const, src: imgPreview } : { type: "NONE" as const },
    body: t.body,
    footer: t.footer,
    buttons: t.buttons.map((b) => ({ type: b.type, text: b.text })),
  };

  return (
    <div className="space-y-5">
      <a href="/whatsapp/templates" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Templates
      </a>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Section title="Basics" hint="Meta reviews every template, usually within minutes.">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <Field label="Template name" hint={rawName && rawName !== t.name ? <>Saved as <code className="font-mono">{t.name || "…"}</code></> : "Lowercase letters, numbers and underscores."}>
                <input
                  className={cx(inputCls, "font-mono")}
                  value={rawName}
                  maxLength={WA_LIMITS.name}
                  onChange={(e) => {
                    setRawName(e.target.value);
                    set({ name: waTemplateName(e.target.value) });
                  }}
                  placeholder="intro_offer"
                />
              </Field>
              <Field label="Language">
                <select className={inputCls} value={t.language} onChange={(e) => set({ language: e.target.value })}>
                  {WA_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <p className="text-[15px] font-medium text-stone-700">Category</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {WA_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ category: c })}
                    aria-pressed={t.category === c}
                    className={cx("rounded-xl px-4 py-3 text-left ring-1 transition", t.category === c ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-stone-200 hover:ring-stone-300")}
                  >
                    <span className="block text-[15px] font-semibold text-stone-900">{WA_CATEGORY_INFO[c].label}</span>
                    <span className="block text-[13.5px] text-stone-500">{WA_CATEGORY_INFO[c].sub}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[13.5px] text-stone-500">Outreach is Marketing. Meta moves a template to Marketing if it promotes anything.</p>
            </div>
          </Section>

          <Section title="Header" hint="Optional: a bold title line or an image above the message.">
            <div className="flex gap-1 rounded-xl bg-stone-100/80 p-1">
              {(["NONE", "TEXT", "IMAGE"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={t.header.type === h}
                  onClick={() => set({ header: h === "NONE" ? { type: "NONE" } : h === "TEXT" ? { type: "TEXT", text: "" } : { type: "IMAGE" } })}
                  className={cx("flex-1 rounded-lg px-3 py-1.5 text-[14px] font-medium", t.header.type === h ? "bg-white text-stone-900 shadow-sm" : "text-stone-600")}
                >
                  {h === "NONE" ? "None" : h === "TEXT" ? "Text" : "Image"}
                </button>
              ))}
            </div>
            {t.header.type === "TEXT" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <Field label="Header text" hint={`${t.header.text.length} / ${WA_LIMITS.headerText}. One variable allowed: {{1}}.`}>
                  <input className={inputCls} value={t.header.text} maxLength={WA_LIMITS.headerText} onChange={(e) => set({ header: { ...t.header, type: "TEXT", text: e.target.value } })} placeholder="A quick idea for {{1}}" />
                </Field>
                {waVariables(t.header.text).length > 0 && (
                  <Field label="Sample for {{1}}">
                    <input className={inputCls} value={t.header.type === "TEXT" ? (t.header.example ?? "") : ""} onChange={(e) => t.header.type === "TEXT" && set({ header: { ...t.header, example: e.target.value } })} placeholder="Acme" />
                  </Field>
                )}
              </div>
            )}
            {t.header.type === "IMAGE" && (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-4 py-4 text-[14px] text-stone-600 hover:border-stone-400">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
                <span>
                  <span className="block font-medium text-stone-800">{t.header.handle ? "Image uploaded. Choose another?" : "Upload a sample image (JPG or PNG, up to 5 MB)"}</span>
                  <span className="block text-[13px] text-stone-500">Meta reviews with it. Each campaign can send its own image later.</span>
                </span>
                <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
              </label>
            )}
          </Section>

          <Section title="Message" hint="Use {{1}}, {{2}} … for what changes per person, like their name or company.">
            <div>
              <div className="flex items-center gap-1 rounded-t-lg border border-b-0 border-stone-200 bg-stone-50 px-2 py-1">
                <button type="button" onClick={() => edit("bold")} className="rounded p-1.5 text-stone-600 hover:bg-white" aria-label="Bold">
                  <Bold className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => edit("italic")} className="rounded p-1.5 text-stone-600 hover:bg-white" aria-label="Italic">
                  <Italic className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => edit("var")} className="ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] font-medium text-emerald-700 hover:bg-white">
                  <Variable className="h-4 w-4" aria-hidden /> Add variable
                </button>
                <span className="ml-auto text-[12.5px] text-stone-400">
                  {t.body.length} / {WA_LIMITS.body}
                </span>
              </div>
              <textarea
                ref={body}
                aria-label="Message"
                className="block min-h-[160px] w-full rounded-b-lg border border-stone-200 bg-white px-3 py-2.5 text-[15.5px] leading-relaxed text-stone-900 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200"
                value={t.body}
                maxLength={WA_LIMITS.body}
                onChange={(e) => set({ body: e.target.value })}
                placeholder={"Hi {{1}}, I noticed {{2}} is growing its sales team. We help teams like yours book more meetings on WhatsApp. Open to a quick chat this week?"}
              />
            </div>
            {bodyVars.length > 0 && (
              <div>
                <p className="text-[14px] font-medium text-stone-700">Sample values</p>
                <p className="text-[13px] text-stone-500">Meta reviews the message with these. Campaigns fill real values for each person.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {bodyVars.map((n) => (
                    <label key={n} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 rounded bg-emerald-50 px-1.5 py-1 text-center font-mono text-[12.5px] text-emerald-800">{`{{${n}}}`}</span>
                      <input
                        className="w-full rounded-lg border border-stone-200 px-3 py-2 text-[14.5px]"
                        value={t.bodyExamples[n - 1] ?? ""}
                        onChange={(e) => {
                          const ex = [...t.bodyExamples];
                          ex[n - 1] = e.target.value;
                          set({ bodyExamples: ex });
                        }}
                        placeholder={n === 1 ? "Sara" : n === 2 ? "Acme" : "Sample"}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Field label="Footer (optional)" hint={`${t.footer.length} / ${WA_LIMITS.footer}`}>
              <input className={inputCls} value={t.footer} maxLength={WA_LIMITS.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="Reply STOP to opt out" />
            </Field>
            {!/stop/i.test(t.footer) && t.category === "MARKETING" && (
              <button type="button" onClick={() => set({ footer: "Reply STOP to opt out" })} className="-mt-2 text-[13.5px] font-medium text-emerald-700 hover:underline">
                Add &ldquo;Reply STOP to opt out&rdquo; (fewer blocks, better quality)
              </button>
            )}
          </Section>

          <Section title="Buttons" hint="Optional: quick replies people tap, a link to your site, or a call button.">
            {t.buttons.map((b, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-stone-500">
                  {b.type === "QUICK_REPLY" ? <Reply className="h-4 w-4" aria-hidden /> : b.type === "URL" ? <ExternalLink className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
                </span>
                <input className="min-w-[140px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14.5px]" value={b.text} maxLength={WA_LIMITS.buttonText} onChange={(e) => setButton(i, { ...b, text: e.target.value })} placeholder={b.type === "QUICK_REPLY" ? "Yes, interested" : b.type === "URL" ? "Book a call" : "Call us"} aria-label={`Button ${i + 1} text`} />
                {b.type === "URL" && (
                  <>
                    <input className="min-w-[200px] flex-[2] rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14.5px]" value={b.url} onChange={(e) => setButton(i, { ...b, url: e.target.value })} placeholder="https://company.com/book" aria-label={`Button ${i + 1} link`} />
                    {waVariables(b.url).length > 0 && (
                      <input className="min-w-[200px] flex-[2] rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14.5px]" value={b.example ?? ""} onChange={(e) => setButton(i, { ...b, example: e.target.value })} placeholder="Sample full link" aria-label={`Button ${i + 1} sample link`} />
                    )}
                  </>
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input className="min-w-[180px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14.5px]" value={b.phone} onChange={(e) => setButton(i, { ...b, phone: e.target.value })} placeholder="+971 50 123 4567" aria-label={`Button ${i + 1} phone`} />
                )}
                <button type="button" onClick={() => set({ buttons: t.buttons.filter((_, j) => j !== i) })} className="mt-1 rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-rose-600" aria-label={`Remove button ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={count("QUICK_REPLY") >= WA_LIMITS.quickReplies || t.buttons.length >= WA_LIMITS.buttons} onClick={() => addButton("QUICK_REPLY")} className={btn.secondary}>
                <Plus className="h-4 w-4" aria-hidden /> Quick reply
              </button>
              <button type="button" disabled={count("URL") >= WA_LIMITS.urlButtons || t.buttons.length >= WA_LIMITS.buttons} onClick={() => addButton("URL")} className={btn.secondary}>
                <Plus className="h-4 w-4" aria-hidden /> Website link
              </button>
              <button type="button" disabled={count("PHONE_NUMBER") >= WA_LIMITS.phoneButtons || t.buttons.length >= WA_LIMITS.buttons} onClick={() => addButton("PHONE_NUMBER")} className={btn.secondary}>
                <Plus className="h-4 w-4" aria-hidden /> Call button
              </button>
            </div>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[2rem] border-[6px] border-stone-900 bg-stone-900 shadow-xl">
            <div className="flex items-center gap-2.5 bg-[#075e54] px-4 py-3 text-white">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-[13px] font-semibold">{(business || "B").charAt(0).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{business || "Your business"}</span>
                <span className="block text-[11.5px] text-white/70">Business account</span>
              </span>
            </div>
            <WaChatBackground className="min-h-[420px] px-3 py-4">
              <p className="mx-auto mb-3 w-fit rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-stone-500">Today</p>
              <WaBubble t={preview} values={t.bodyExamples} headerValue={t.header.type === "TEXT" ? t.header.example : undefined} />
            </WaChatBackground>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            {tried && errors.length > 0 && (
              <ul className="mb-3 space-y-1 text-[13.5px] text-rose-700" role="alert">
                {errors.slice(0, 5).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            {err && (
              <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[13.5px] text-rose-800" role="alert">
                {err}
              </p>
            )}
            <button type="button" onClick={submit} disabled={pending || uploading} className={cx(btn.primary, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Submit to Meta
            </button>
            <p className="mt-2 text-center text-[12.5px] text-stone-500">You&apos;ll see it under &ldquo;In review&rdquo; until Meta decides.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
