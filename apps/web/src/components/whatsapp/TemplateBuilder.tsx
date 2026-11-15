"use client";

import {
  WA_CATEGORIES,
  WA_CATEGORY_INFO,
  WA_HEADER_MEDIA,
  WA_LANGUAGES,
  WA_LIMITS,
  WA_TEMPLATE_KINDS,
  checkTemplate,
  nextVariable,
  waTemplateName,
  waVariables,
  type WaButton,
  type WaCategory,
  type WaHeaderMedia,
  type WaTemplateDraft,
  type WaTemplateKind,
} from "@invytra/shared";
import { AlertTriangle, ArrowLeft, Bold, Check, ChevronDown, Copy, CreditCard, ExternalLink, FileText, Italic, LayoutGrid, Loader2, Lock, Megaphone, MessageSquareText, Phone, Receipt, Reply, Send, Strikethrough, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { createTemplateAction, uploadHeaderMediaAction } from "@/app/whatsapp/actions";
import { btn } from "../btn";
import { Field, inputCls } from "../fields";
import { cx } from "../ui";
import { SampleDialog, sampleSlots } from "./SampleDialog";
import { WaPhone, type ChatBusiness } from "./WaPhone";

const CAT_ICON = { MARKETING: Megaphone, UTILITY: Receipt, AUTHENTICATION: Lock } as const;
const KIND_ICON = { buttons: MessageSquareText, simple: FileText, otp: Lock, pay: CreditCard, carousel: LayoutGrid } as const;
const kindsFor = (c: WaCategory): WaTemplateKind[] => (c === "AUTHENTICATION" ? ["otp"] : ["buttons", "simple", "pay", "carousel"]);
const DEFAULT_OTP = { securityNote: true, expiryMinutes: 10, buttonText: "Copy code" };

/** Step 1, then step 2: choose the category and kind, then write it, with a live phone preview. */
export function TemplateBuilder({ initial, business, copied }: { initial: WaTemplateDraft; business: ChatBusiness; copied?: boolean }) {
  const router = useRouter();
  const [t, setT] = useState<WaTemplateDraft>(initial);
  const [kind, setKind] = useState<WaTemplateKind>(initial.category === "AUTHENTICATION" ? "otp" : initial.buttons.length || !copied ? "buttons" : "simple");
  const [step, setStep] = useState<1 | 2>(copied ? 2 : 1);
  const [rawName, setRawName] = useState(initial.name);
  const [media, setMedia] = useState<{ src?: string; fileName?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [ask, setAsk] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const set = (p: Partial<WaTemplateDraft>) => setT((x) => ({ ...x, ...p }));
  const otp = t.otp ?? DEFAULT_OTP;
  const errors = useMemo(() => checkTemplate(t), [t]);
  const bodyVars = [...new Set(waVariables(t.body))].sort((a, b) => a - b);
  // Meta's rules about where variables go, shown while typing.
  const bodyWarnings = t.body.trim() ? errors.filter((e) => /variable/i.test(e) && !/sample|header|footer|button|link/i.test(e)) : [];

  const chooseCategory = (c: WaCategory) => {
    set({ category: c, ...(c === "AUTHENTICATION" ? { otp: otp, header: { type: "NONE" }, buttons: [] } : { buttons: t.buttons.filter((b) => b.type !== "COPY_CODE" || c === "MARKETING") }) });
    setKind(c === "AUTHENTICATION" ? "otp" : kind === "otp" ? "buttons" : kind);
  };
  const chooseKind = (k: WaTemplateKind) => {
    if (WA_TEMPLATE_KINDS[k] && "soon" in WA_TEMPLATE_KINDS[k]) return;
    setKind(k);
    if (k === "simple") set({ buttons: [] });
  };

  const edit = (k: "bold" | "italic" | "strike" | "var") => {
    const el = body.current;
    const [a, b] = el ? [el.selectionStart, el.selectionEnd] : [t.body.length, t.body.length];
    const sel = t.body.slice(a, b);
    const wrap = { bold: "*", italic: "_", strike: "~" } as const;
    const ins = k === "var" ? `{{${nextVariable(t.body)}}}` : `${wrap[k]}${sel || (k === "bold" ? "bold" : k === "italic" ? "italic" : "text")}${wrap[k]}`;
    const next = t.body.slice(0, a) + ins + t.body.slice(b);
    if (next.length <= WA_LIMITS.body) set({ body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + ins.length, a + ins.length);
    });
  };

  const setButton = (i: number, b: WaButton) => set({ buttons: t.buttons.map((x, j) => (j === i ? b : x)) });
  const addButton = (type: WaButton["type"]) =>
    set({
      buttons: [
        ...t.buttons,
        type === "QUICK_REPLY" ? { type, text: "" } : type === "URL" ? { type, text: "", url: "https://" } : type === "COPY_CODE" ? { type, text: "", code: "" } : { type, text: "Call us", phone: "" },
      ],
    });
  const count = (type: WaButton["type"]) => t.buttons.filter((b) => b.type === type).length;
  const full = t.buttons.length >= WA_LIMITS.buttons;

  const upload = async (kindOf: WaHeaderMedia, file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setErr(null);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kindOf);
    const r = await uploadHeaderMediaAction(form);
    setUploading(false);
    if (!r.ok) return setErr(r.error);
    setMedia({ src: URL.createObjectURL(file), fileName: file.name });
    set({ header: { type: kindOf, handle: r.value.handle, fileName: file.name } });
  };

  const send = (draft: WaTemplateDraft) =>
    start(async () => {
      setErr(null);
      const r = await createTemplateAction(draft);
      if (!r.ok) return setErr(r.error);
      router.push("/whatsapp/templates");
      router.refresh();
    });
  // Sample values are asked in a popup on submit; everything else must be right first.
  const blocking = errors.filter((e) => !/sample/i.test(e));
  const submit = () => {
    setTried(true);
    setErr(null);
    if (blocking.length) return;
    if (t.category !== "AUTHENTICATION" && sampleSlots(t).length) return setAsk(true);
    send(t);
  };

  const preview =
    t.category === "AUTHENTICATION"
      ? {
          header: { type: "NONE" as const },
          body: `*123456* is your verification code.${otp.securityNote ? " For your security, do not share this code." : ""}`,
          footer: otp.expiryMinutes ? `This code expires in ${otp.expiryMinutes} minutes.` : "",
          buttons: [{ type: "OTP", text: otp.buttonText || "Copy code" }],
        }
      : {
          header: t.header.type === "TEXT" ? { type: "TEXT" as const, text: t.header.text } : t.header.type === "NONE" ? { type: "NONE" as const } : { type: t.header.type, src: media.src, fileName: media.fileName },
          body: t.body,
          footer: t.footer,
          buttons: t.buttons.map((b) => ({ type: b.type, text: b.type === "COPY_CODE" ? "Copy offer code" : b.text })),
        };
  const CatIcon = CAT_ICON[t.category];

  return (
    <div className="space-y-5">
      <a href="/whatsapp/templates" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Templates
      </a>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_350px]">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {/* Step 1 */}
          <section className="border-b border-stone-100">
            <button type="button" onClick={() => setStep(1)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={step === 1}>
              <StepDot n={1} done={step === 2} />
              <span className="flex-1">
                <span className="block text-[16px] font-semibold text-stone-900">Choose template category &amp; type</span>
                {step === 2 && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-stone-500">
                    <CatIcon className="h-3.5 w-3.5" aria-hidden /> {WA_CATEGORY_INFO[t.category].label} · {WA_TEMPLATE_KINDS[kind].label}
                  </span>
                )}
              </span>
              <ChevronDown className={cx("h-5 w-5 text-stone-400 transition", step === 1 && "rotate-180")} aria-hidden />
            </button>
            {step === 1 && (
              <div className="space-y-5 px-5 pb-5">
                <div>
                  <p className="text-[12.5px] font-semibold uppercase tracking-wider text-stone-500">Template category</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {WA_CATEGORIES.map((c) => {
                      const Icon = CAT_ICON[c];
                      const on = t.category === c;
                      return (
                        <button key={c} type="button" onClick={() => chooseCategory(c)} aria-pressed={on} className={cx("rounded-xl px-4 py-3 text-left ring-1 transition", on ? "bg-emerald-50/70 ring-2 ring-emerald-500" : "bg-stone-50 ring-stone-200 hover:ring-stone-300")}>
                          <span className={cx("flex items-center gap-2 text-[15px] font-semibold", on ? "text-emerald-800" : "text-stone-900")}>
                            <Icon className="h-4 w-4" aria-hidden /> {WA_CATEGORY_INFO[c].label}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-stone-500">{WA_CATEGORY_INFO[c].sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Meta may move a template to another category after review. Outreach and offers are Marketing.
                  </p>
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold uppercase tracking-wider text-stone-500">Template type</p>
                  <div className="mt-2 space-y-2">
                    {kindsFor(t.category).map((k) => {
                      const def = WA_TEMPLATE_KINDS[k];
                      const soon = "soon" in def;
                      const on = kind === k;
                      const Icon = KIND_ICON[k];
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={soon}
                          onClick={() => chooseKind(k)}
                          aria-pressed={on}
                          className={cx("flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left ring-1 transition", on ? "bg-emerald-50/70 ring-2 ring-emerald-500" : "bg-white ring-stone-200", soon ? "cursor-not-allowed opacity-55" : !on && "hover:ring-stone-300")}
                        >
                          <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2", on ? "bg-emerald-600 ring-emerald-600" : "ring-stone-300")}>{on && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                          <Icon className={cx("h-5 w-5 shrink-0", on ? "text-emerald-700" : "text-stone-500")} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={cx("block text-[15px] font-semibold", on ? "text-emerald-800" : "text-stone-900")}>{def.label}</span>
                            <span className="block text-[13.5px] text-stone-500">{def.sub}</span>
                          </span>
                          {soon && <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-500 ring-1 ring-stone-200">Coming soon</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" className={btn.primary} onClick={() => setStep(2)}>
                    Save &amp; continue
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Step 2 */}
          <section>
            <button type="button" onClick={() => setStep(2)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={step === 2}>
              <StepDot n={2} />
              <span className="flex-1 text-[16px] font-semibold text-stone-900">Draft your template</span>
              <ChevronDown className={cx("h-5 w-5 text-stone-400 transition", step === 2 && "rotate-180")} aria-hidden />
            </button>
            {step === 2 && (
              <div className="space-y-6 px-5 pb-6">
                <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                  <Field label="Template name" hint={rawName && rawName !== t.name ? <>Saved as <code className="font-mono">{t.name || "…"}</code></> : "Lowercase letters, numbers and underscores."}>
                    <input
                      className={cx(inputCls, "font-mono")}
                      value={rawName}
                      maxLength={WA_LIMITS.name}
                      onChange={(e) => {
                        setRawName(e.target.value);
                        set({ name: waTemplateName(e.target.value) });
                      }}
                      placeholder={t.category === "AUTHENTICATION" ? "login_code" : "navratri_flash_sale"}
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

                {kind === "otp" ? (
                  <div className="space-y-4 rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
                    <p className="text-[14px] text-stone-600">Meta writes the message of a passcode template (in the language you chose). You choose these options; Invytra fills the code when it&apos;s sent.</p>
                    <label className="flex items-start gap-2 text-[14.5px] text-stone-800">
                      <input type="checkbox" className="mt-1 accent-emerald-600" checked={otp.securityNote} onChange={(e) => set({ otp: { ...otp, securityNote: e.target.checked } })} />
                      Add &ldquo;For your security, do not share this code.&rdquo;
                    </label>
                    <div className="flex flex-wrap items-center gap-2 text-[14.5px] text-stone-800">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="accent-emerald-600" checked={otp.expiryMinutes !== null} onChange={(e) => set({ otp: { ...otp, expiryMinutes: e.target.checked ? 10 : null } })} />
                        Say when the code expires:
                      </label>
                      {otp.expiryMinutes !== null && (
                        <>
                          <input type="number" min={1} max={90} className="w-20 rounded-lg border border-stone-200 px-2 py-1.5" value={otp.expiryMinutes} onChange={(e) => set({ otp: { ...otp, expiryMinutes: Math.round(Number(e.target.value)) || 1 } })} aria-label="Minutes" /> minutes
                        </>
                      )}
                    </div>
                    <Field label="Copy button text">
                      <input className={cx(inputCls, "max-w-xs")} value={otp.buttonText} maxLength={WA_LIMITS.buttonText} onChange={(e) => set({ otp: { ...otp, buttonText: e.target.value } })} />
                    </Field>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[15px] font-semibold text-stone-900">
                          Header <span className="font-normal text-stone-400">optional</span>
                        </p>
                        <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-200">
                          {(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const).map((h) => (
                            <button
                              key={h}
                              type="button"
                              aria-pressed={t.header.type === h}
                              onClick={() => {
                                setMedia({});
                                set({ header: h === "NONE" ? { type: "NONE" } : h === "TEXT" ? { type: "TEXT", text: "" } : { type: h } });
                              }}
                              className={cx("border-l border-stone-200 px-3 py-1.5 text-[13.5px] font-medium first:border-l-0", t.header.type === h ? "bg-emerald-50 text-emerald-800" : "bg-white text-stone-600 hover:bg-stone-50")}
                            >
                              {h === "NONE" ? "None" : h === "TEXT" ? "Text" : WA_HEADER_MEDIA[h].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {t.header.type === "TEXT" && (
                        <div className="mt-3">
                          <div>
                            <input className={inputCls} value={t.header.text} maxLength={WA_LIMITS.headerText} onChange={(e) => set({ header: { ...t.header, type: "TEXT", text: e.target.value } })} placeholder="Navratri Flash Sale" aria-label="Header text" />
                            <p className="mt-1 flex justify-between text-[12.5px] text-stone-400">
                              <span>No emojis or formatting in the header. One variable allowed.</span>
                              <span>
                                {t.header.text.length} / {WA_LIMITS.headerText}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      {(t.header.type === "IMAGE" || t.header.type === "VIDEO" || t.header.type === "DOCUMENT") && (
                        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/60 px-4 py-4 text-[14px] text-stone-600 hover:border-stone-400">
                          {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Upload className="h-5 w-5" aria-hidden />}
                          <span>
                            <span className="block font-medium text-stone-800">{"handle" in t.header && t.header.handle ? `${media.fileName ?? "File"} uploaded. Choose another?` : `Upload a sample ${WA_HEADER_MEDIA[t.header.type].label.toLowerCase()} (${WA_HEADER_MEDIA[t.header.type].hint})`}</span>
                            <span className="block text-[13px] text-stone-500">Meta reviews with it. Each campaign sends its own file.</span>
                          </span>
                          <input type="file" accept={WA_HEADER_MEDIA[t.header.type].accept} className="sr-only" onChange={(e) => void upload(t.header.type as WaHeaderMedia, e.target.files?.[0])} />
                        </label>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-semibold text-stone-900">Body</p>
                        <button type="button" onClick={() => edit("var")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[14px] font-semibold text-emerald-700 hover:bg-emerald-50">
                          <span className="font-mono text-[13px]">{"{ }"}</span> Add variable
                        </button>
                      </div>
                      <div className="mt-2 rounded-xl ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-emerald-400">
                        <div className="flex items-center gap-0.5 border-b border-stone-100 px-2 py-1">
                          {(
                            [
                              ["bold", Bold, "Bold"],
                              ["italic", Italic, "Italic"],
                              ["strike", Strikethrough, "Strikethrough"],
                            ] as const
                          ).map(([k, Icon, l]) => (
                            <button key={k} type="button" onClick={() => edit(k)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900" aria-label={l}>
                              <Icon className="h-4 w-4" aria-hidden />
                            </button>
                          ))}
                        </div>
                        <textarea
                          ref={body}
                          aria-label="Body"
                          className="block min-h-[150px] w-full resize-y rounded-b-xl bg-white px-3.5 py-3 text-[15.5px] leading-relaxed text-stone-900 focus:outline-none"
                          value={t.body}
                          maxLength={WA_LIMITS.body}
                          onChange={(e) => set({ body: e.target.value })}
                          placeholder="Hi {{1}}, celebrate Navratri with flat 30% off on all chaniya cholis. Use code NAV30 before {{2}}."
                        />
                      </div>
                      <p className="mt-1.5 flex justify-between text-[13px] text-stone-500">
                        <span>
                          {bodyVars.length} variable{bodyVars.length === 1 ? "" : "s"}
                          {bodyVars.length > 0 && " · you'll add sample values when you submit"}
                        </span>
                        <span>
                          {t.body.length} / {WA_LIMITS.body}
                        </span>
                      </p>
                      {bodyWarnings.length > 0 && (
                        <div className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13.5px] text-amber-800 ring-1 ring-amber-200" role="status">
                          {bodyWarnings.map((w) => (
                            <p key={w} className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[15px] font-semibold text-stone-900">
                        Footer <span className="font-normal text-stone-400">optional</span>
                      </p>
                      <input className={cx(inputCls, "mt-2")} value={t.footer} maxLength={WA_LIMITS.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="Reply STOP to opt out" aria-label="Footer" />
                      <p className="mt-1 flex justify-between text-[12.5px] text-stone-400">
                        {!/stop/i.test(t.footer) && t.category === "MARKETING" ? (
                          <button type="button" onClick={() => set({ footer: "Reply STOP to opt out" })} className="font-medium text-emerald-700 hover:underline">
                            Add &ldquo;Reply STOP to opt out&rdquo; (fewer blocks, better quality)
                          </button>
                        ) : (
                          <span />
                        )}
                        <span>
                          {t.footer.length} / {WA_LIMITS.footer}
                        </span>
                      </p>
                    </div>

                    {kind === "buttons" && (
                      <div>
                        <p className="text-[15px] font-semibold text-stone-900">Buttons</p>
                        <p className="text-[13.5px] text-stone-500">Up to 10. Quick replies stay together, before or after the other buttons.</p>
                        <div className="mt-3 space-y-2">
                          {t.buttons.map((b, i) => (
                            <ButtonRow key={i} b={b} i={i} onChange={(nb) => setButton(i, nb)} onRemove={() => set({ buttons: t.buttons.filter((_, j) => j !== i) })} />
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={full || count("QUICK_REPLY") >= WA_LIMITS.quickReplies} onClick={() => addButton("QUICK_REPLY")} className={btn.secondary}>
                            <Reply className="h-4 w-4" aria-hidden /> Quick reply
                          </button>
                          <button type="button" disabled={full || count("URL") >= WA_LIMITS.urlButtons} onClick={() => addButton("URL")} className={btn.secondary}>
                            <ExternalLink className="h-4 w-4" aria-hidden /> Website link
                          </button>
                          <button type="button" disabled={full || count("PHONE_NUMBER") >= WA_LIMITS.phoneButtons} onClick={() => addButton("PHONE_NUMBER")} className={btn.secondary}>
                            <Phone className="h-4 w-4" aria-hidden /> Call button
                          </button>
                          {t.category === "MARKETING" && (
                            <button type="button" disabled={full || count("COPY_CODE") >= 1} onClick={() => addButton("COPY_CODE")} className={btn.secondary}>
                              <Copy className="h-4 w-4" aria-hidden /> Copy code
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <WaPhone t={preview} values={t.bodyExamples} headerValue={t.header.type === "TEXT" ? t.header.example : undefined} business={business} />
          {!business.photo && (
            <p className="text-center text-[13px] text-stone-500">
              No profile photo yet.{" "}
              <a href="/whatsapp/number" className="font-medium text-emerald-700 hover:underline">
                Add one
              </a>
            </p>
          )}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            {tried && blocking.length > 0 && (
              <ul className="mb-3 space-y-1 text-[13.5px] text-rose-700" role="alert">
                {blocking.slice(0, 5).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            {err && !ask && (
              <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[13.5px] text-rose-800" role="alert">
                {err}
              </p>
            )}
            <button type="button" onClick={step === 1 ? () => setStep(2) : submit} disabled={pending || uploading} className={cx(btn.primary, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : step === 1 ? <Check className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {step === 1 ? "Continue to draft" : "Submit to Meta"}
            </button>
            <p className="mt-2 text-center text-[12.5px] text-stone-500">Meta usually reviews within minutes, at most 24 hours.</p>
          </div>
        </aside>
      </div>
      {ask && (
        <SampleDialog
          t={t}
          pending={pending}
          error={err}
          onCancel={() => setAsk(false)}
          onConfirm={(draft) => {
            setT(draft);
            send(draft);
          }}
        />
      )}
    </div>
  );
}

function StepDot({ n, done }: { n: number; done?: boolean }) {
  return <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ring-2", done ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-emerald-700 ring-emerald-500")}>{done ? <Check className="h-4 w-4" aria-hidden /> : n}</span>;
}

const ROW_ICON = { QUICK_REPLY: Reply, URL: ExternalLink, PHONE_NUMBER: Phone, COPY_CODE: Copy } as const;
const ROW_LABEL = { QUICK_REPLY: "Quick reply", URL: "Website", PHONE_NUMBER: "Call", COPY_CODE: "Copy code" } as const;

function ButtonRow({ b, i, onChange, onRemove }: { b: WaButton; i: number; onChange: (b: WaButton) => void; onRemove: () => void }) {
  const Icon = ROW_ICON[b.type];
  const input = "min-w-[150px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14.5px]";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <span className="inline-flex w-[104px] items-center gap-1.5 text-[13px] font-medium text-stone-600">
        <Icon className="h-4 w-4" aria-hidden /> {ROW_LABEL[b.type]}
      </span>
      {b.type === "COPY_CODE" ? (
        <>
          <span className="text-[13.5px] text-stone-500">&ldquo;Copy offer code&rdquo; with code</span>
          <input className={cx(input, "max-w-[180px] font-mono uppercase")} value={b.code} maxLength={15} onChange={(e) => onChange({ ...b, code: e.target.value.replace(/\s/g, "") })} placeholder="NAV30" aria-label={`Button ${i + 1} code`} />
        </>
      ) : (
        <input className={input} value={b.text} maxLength={WA_LIMITS.buttonText} onChange={(e) => onChange({ ...b, text: e.target.value })} placeholder={b.type === "QUICK_REPLY" ? "Shop now" : b.type === "URL" ? "Visit website" : "Call us"} aria-label={`Button ${i + 1} text`} />
      )}
      {b.type === "URL" && (
        <>
          <input className={cx(input, "flex-[2]")} value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} placeholder="https://company.com/sale" aria-label={`Button ${i + 1} link`} />
        </>
      )}
      {b.type === "PHONE_NUMBER" && <input className={input} value={b.phone} onChange={(e) => onChange({ ...b, phone: e.target.value })} placeholder="+971 50 123 4567" aria-label={`Button ${i + 1} phone`} />}
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-stone-400 hover:bg-white hover:text-rose-600" aria-label={`Remove button ${i + 1}`}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
