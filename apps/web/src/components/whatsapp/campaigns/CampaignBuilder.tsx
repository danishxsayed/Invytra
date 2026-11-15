"use client";

import { WA_FIELDS, checkSources, readMetaComponents, resolveSource, templateNeeds, waLanguageLabel, type WaContactValues, type WaField, type WaSlot, type WaVarSource } from "@invytra/shared";
import { ArrowLeft, CalendarClock, Check, Loader2, Rocket, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { audienceAction, createWaCampaignAction } from "@/app/whatsapp/campaigns/actions";
import { btn } from "../../btn";
import { Field, inputCls } from "../../fields";
import { cx } from "../../ui";
import { WaBubble, WaChatBackground } from "../WaBubble";

export interface BuilderTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
}

const Step = ({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-white p-5 ring-1 ring-stone-200">
    <h2 className="flex items-center gap-2.5 text-[16px] font-semibold text-stone-900">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-[12.5px] text-white">{n}</span> {title}
    </h2>
    {hint && <p className="ml-[34px] mt-0.5 text-[14px] text-stone-500">{hint}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

/** A good guess for each slot: the header's and the body's {{1}} → first name, the body's {{2}} → company. */
function guess(slot: WaSlot): WaVarSource {
  if (slot === "header" || slot === "body:1") return { kind: "field", field: "first_name", fallback: "there" };
  if (slot === "body:2") return { kind: "field", field: "company", fallback: "your team" };
  return { kind: "text", value: "" };
}

/** Name it, pick an approved template, choose who gets it, fill its variables, send now or later. */
export function CampaignBuilder({ templates, tags, customKeys, business }: { templates: BuilderTemplate[]; tags: { tag: string; count: number }[]; customKeys: string[]; business: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<WaSlot, WaVarSource>>>({});
  const [mediaUrl, setMediaUrl] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [sendAt, setSendAt] = useState("");
  const [aud, setAud] = useState<{ count: number; sample: WaContactValues | null } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const t = templates.find((x) => x.id === templateId);
  const needs = useMemo(() => (t ? templateNeeds(t.components) : { slots: [], media: null }), [t]);
  useEffect(() => setMap(Object.fromEntries(needs.slots.map((s) => [s.slot, guess(s.slot)]))), [needs]);
  useEffect(() => {
    let live = true;
    void audienceAction(picked).then((r) => live && setAud(r));
    return () => {
      live = false;
    };
  }, [picked]);

  const errors = [...(!name.trim() ? ["Name the campaign."] : []), ...(!t ? ["Choose a template."] : []), ...checkSources(needs, map, mediaUrl), ...(aud && !aud.count ? ["Nobody to send to: pick other tags."] : []), ...(when === "later" && !sendAt ? ["Choose when to send it."] : [])];
  const view = t ? readMetaComponents(t.components) : null;
  const sample: WaContactValues = aud?.sample ?? { phone: "971500000000", firstName: "Sara", lastName: null, company: "Acme", email: null, vars: {} };
  const bodyValues = needs.slots.filter((s) => s.slot.startsWith("body:")).reduce<string[]>((a, s) => ((a[Number(s.slot.split(":")[1]) - 1] = resolveSource(map[s.slot], sample)), a), []);

  const setSource = (slot: WaSlot, v: WaVarSource) => setMap((m) => ({ ...m, [slot]: v }));
  const sourceValue = (s: WaVarSource | undefined) => (!s ? "" : s.kind === "field" ? `field:${s.field}` : s.kind === "custom" ? `custom:${s.key}` : "text");

  const launch = () => {
    setTried(true);
    if (errors.length) return;
    start(async () => {
      setError(null);
      const r = await createWaCampaignAction({ name, templateId, tags: picked, varMap: map, mediaUrl, sendAt: when === "later" ? new Date(sendAt).toISOString() : "" });
      if (!r.ok) return setError(r.error);
      router.push(`/whatsapp/campaigns/${r.value.id}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <a href="/whatsapp/campaigns" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Campaigns
      </a>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Step n={1} title="Name and template" hint="Only templates Meta approved can start a conversation.">
            <Field label="Campaign name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dubai warm leads – November" maxLength={120} />
            </Field>
            <div>
              <p className="text-[15px] font-medium text-stone-700">Template</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {templates.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setTemplateId(x.id)}
                    aria-pressed={x.id === templateId}
                    className={cx("rounded-xl px-4 py-3 text-left ring-1 transition", x.id === templateId ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-stone-200 hover:ring-stone-300")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[14px] font-semibold text-stone-900">{x.name}</span>
                      {x.id === templateId && <Check className="h-4 w-4 shrink-0 text-stone-900" aria-hidden />}
                    </span>
                    <span className="block text-[13px] text-stone-500">
                      {x.category.toLowerCase()} · {waLanguageLabel(x.language)}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[13.5px] text-stone-600">{readMetaComponents(x.components).body}</span>
                  </button>
                ))}
              </div>
            </div>
          </Step>

          <Step n={2} title="Who gets it" hint="Subscribed contacts with any of the tags you pick. Opted-out numbers and your do-not-contact list are always left out.">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPicked([])} aria-pressed={!picked.length} className={cx("rounded-full px-3 py-1.5 text-[14px] font-medium ring-1", !picked.length ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-700 ring-stone-200")}>
                Everyone subscribed
              </button>
              {tags.map((x) => {
                const on = picked.includes(x.tag);
                return (
                  <button
                    key={x.tag}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((p) => (on ? p.filter((y) => y !== x.tag) : [...p, x.tag]))}
                    className={cx("rounded-full px-3 py-1.5 text-[14px] font-medium ring-1", on ? "bg-lime-200 text-stone-900 ring-lime-400" : "bg-white text-stone-700 ring-stone-200 hover:ring-stone-300")}
                  >
                    # {x.tag} <span className="opacity-50">{x.count}</span>
                  </button>
                );
              })}
            </div>
            <p className="flex items-center gap-2 rounded-xl bg-stone-50 px-4 py-3 text-[14.5px] text-stone-700 ring-1 ring-stone-200">
              <Users className="h-4 w-4 text-stone-500" aria-hidden />
              {aud ? (
                <>
                  <strong>{aud.count.toLocaleString("en-US")}</strong> {aud.count === 1 ? "person" : "people"} will get it
                </>
              ) : (
                "Counting…"
              )}
            </p>
          </Step>

          {(needs.slots.length > 0 || needs.media) && (
            <Step n={3} title="Personalise" hint="What fills each variable for every person. The fallback is used when someone doesn't have that detail.">
              {needs.slots.map((s) => {
                const src = map[s.slot];
                return (
                  <div key={s.slot} className="grid items-end gap-2 sm:grid-cols-[110px_1fr_1fr]">
                    <span className="mb-2 w-fit rounded bg-emerald-50 px-2 py-1 font-mono text-[13px] text-emerald-800">{s.label}</span>
                    <label className="block text-[13.5px] text-stone-600">
                      Fill with
                      <select
                        className={cx(inputCls, "py-2 text-[14.5px]")}
                        value={sourceValue(src)}
                        onChange={(e) => {
                          const v = e.target.value;
                          const fallback = src && src.kind !== "text" ? src.fallback : "";
                          setSource(s.slot, v === "text" ? { kind: "text", value: "" } : v.startsWith("field:") ? { kind: "field", field: v.slice(6) as WaField, fallback } : { kind: "custom", key: v.slice(7), fallback });
                        }}
                      >
                        {Object.entries(WA_FIELDS).map(([k, l]) => (
                          <option key={k} value={`field:${k}`}>
                            {l}
                          </option>
                        ))}
                        {customKeys.map((k) => (
                          <option key={k} value={`custom:${k}`}>
                            {`{{${k}}}`} (from your import)
                          </option>
                        ))}
                        <option value="text">The same text for everyone</option>
                      </select>
                    </label>
                    {src?.kind === "text" ? (
                      <label className="block text-[13.5px] text-stone-600">
                        Text
                        <input className={cx(inputCls, "py-2 text-[14.5px]")} value={src.value} onChange={(e) => setSource(s.slot, { kind: "text", value: e.target.value })} placeholder={s.slot.startsWith("button:") ? "the end of the link" : "e.g. GITEX"} />
                      </label>
                    ) : (
                      <label className="block text-[13.5px] text-stone-600">
                        Fallback
                        <input className={cx(inputCls, "py-2 text-[14.5px]")} value={src?.fallback ?? ""} onChange={(e) => src && setSource(s.slot, { ...src, fallback: e.target.value })} placeholder="there" />
                      </label>
                    )}
                  </div>
                );
              })}
              {needs.media && (
                <Field label={`Header ${needs.media.toLowerCase()} link`} hint="A public https:// link Meta can download, e.g. from your website.">
                  <input className={inputCls} value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://company.com/offer.jpg" />
                </Field>
              )}
            </Step>
          )}

          <Step n={needs.slots.length || needs.media ? 4 : 3} title="When">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["now", "later"] as const).map((w) => (
                <button key={w} type="button" aria-pressed={when === w} onClick={() => setWhen(w)} className={cx("rounded-xl px-4 py-3 text-left ring-1", when === w ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-stone-200")}>
                  <span className="block text-[15px] font-semibold text-stone-900">{w === "now" ? "Send now" : "Schedule"}</span>
                  <span className="block text-[13.5px] text-stone-500">{w === "now" ? "Starts within a minute, in batches." : "Pick a date and time (your time zone)."}</span>
                </button>
              ))}
            </div>
            {when === "later" && <input type="datetime-local" className={cx(inputCls, "max-w-xs")} value={sendAt} onChange={(e) => setSendAt(e.target.value)} aria-label="Send at" />}
            <p className="text-[13.5px] text-stone-500">Sending stays inside your number&apos;s daily limit of new people; the rest go out the next day by themselves.</p>
          </Step>
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
            <WaChatBackground className="min-h-[380px] px-3 py-4">
              <p className="mx-auto mb-3 w-fit rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-stone-500">As {[sample.firstName, sample.lastName].filter(Boolean).join(" ") || sample.profileName || `+${sample.phone}`} sees it</p>
              {view && (
                <WaBubble
                  t={{ ...view, header: view.header.type !== "TEXT" && view.header.type !== "NONE" ? { type: view.header.type, src: needs.media === "IMAGE" && /^https:\/\//.test(mediaUrl) ? mediaUrl : undefined } : view.header }}
                  values={bodyValues}
                  headerValue={resolveSource(map.header, sample)}
                />
              )}
            </WaChatBackground>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            {tried && errors.length > 0 && (
              <ul role="alert" className="mb-3 space-y-1 text-[13.5px] text-rose-700">
                {errors.slice(0, 4).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[13.5px] text-rose-800">
                {error}
              </p>
            )}
            <button type="button" onClick={launch} disabled={pending} className={cx(btn.primary, "w-full")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : when === "now" ? <Rocket className="h-4 w-4" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
              {when === "now" ? `Send to ${aud?.count ?? "…"} ${aud?.count === 1 ? "person" : "people"}` : "Schedule campaign"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
