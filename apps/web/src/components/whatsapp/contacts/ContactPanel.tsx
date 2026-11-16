"use client";

import { DIAL_CODES, SEGMENT_COLORS, tagColor, tagLabel, waTag, type SegmentColor } from "@invytra/shared";
import { Ban, Check, CircleAlert, Eye, Loader2, Megaphone, MessageCircle, MessageSquare, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteWaContactsAction, getWaContactAction, tagWaContactsAction, updateWaContactAction } from "@/app/whatsapp/contacts/actions";
import type { WaActivity, WaContactDetail } from "@/lib/whatsapp-contact-detail";
import { btn } from "../../btn";
import { Portal } from "../../Portal";
import { cx } from "../../ui";

const ACT_ICON: Record<WaActivity["kind"], typeof MessageCircle> = { added: UserPlus, sent: Megaphone, delivered: Megaphone, read: Eye, failed: CircleAlert, replied: MessageCircle, wrote: MessageCircle, opted_out: Ban };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : day(iso);
};
const initials = (n: string) =>
  n
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** A contact's side panel: details, consent on file, segments and activity, with Edit. */
export function ContactPanel({ id, tags, onClose }: { id: string; tags: string[]; onClose: () => void }) {
  const router = useRouter();
  const [c, setC] = useState<WaContactDetail | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const load = () => void getWaContactAction(id).then(setC);
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when another contact opens
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, editing]);

  const campaign = () =>
    start(async () => {
      const d = new Date();
      const t = `selected-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      const r = await tagWaContactsAction([id], t, true);
      if (!r.ok) return setError(r.error);
      router.push(`/whatsapp/campaigns/new?tag=${encodeURIComponent(t)}`);
    });
  const remove = () =>
    start(async () => {
      const r = await deleteWaContactsAction([id]);
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });

  const hue = c ? tagColor(c.name) : "#22c55e";
  const action = "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[14.5px] font-medium ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-50";

  return (
    <Portal>
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Contact">
        <div className="absolute inset-0 bg-stone-900/30 backdrop-blur-[2px]" onClick={() => !editing && onClose()} />
        <aside className="absolute inset-y-0 right-0 flex w-full max-w-[440px] animate-fade-up flex-col bg-white shadow-2xl">
          <div className="flex justify-end px-4 pt-4">
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {c === undefined ? (
            <div className="grid flex-1 place-items-center text-stone-400">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : c === null ? (
            <p className="px-7 text-[15px] text-stone-500">This contact was deleted.</p>
          ) : editing ? (
            <EditContact
              c={c}
              tags={tags}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                load();
                router.refresh();
              }}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
              <span className="grid h-20 w-20 place-items-center rounded-full text-[26px] font-bold ring-4" style={{ background: `${hue}1f`, color: hue, ["--tw-ring-color" as string]: `${hue}26` }}>
                {initials(c.name)}
              </span>
              <h2 className="mt-4 text-[24px] font-semibold text-stone-900">{c.name}</h2>
              <p className="text-[16px] tabular-nums text-stone-500">{c.phonePretty}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={action} disabled title="The WhatsApp inbox is coming soon">
                  <MessageSquare className="h-4 w-4" aria-hidden /> Message
                </button>
                <button type="button" className={action} onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </button>
                <button type="button" className={action} onClick={campaign} disabled={pending || !c.consent.given || !!c.optedOut} title={!c.consent.given || c.optedOut ? "Only opted-in contacts can get campaigns" : undefined}>
                  <Megaphone className="h-4 w-4" aria-hidden /> Campaign
                </button>
                <button type="button" className={cx(action, "text-rose-600 ring-rose-200 hover:bg-rose-50")} onClick={() => setAskDelete(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </button>
              </div>
              {askDelete && (
                <div className="mt-3 rounded-xl bg-rose-50 p-3 text-[14px] text-rose-900 ring-1 ring-rose-200">
                  Delete {c.name}? Their message history goes too.
                  <div className="mt-2 flex gap-3">
                    <button type="button" disabled={pending} onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white">
                      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete
                    </button>
                    <button type="button" onClick={() => setAskDelete(false)} className="font-medium underline">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">{error}</p>}

              <dl className="mt-6 grid grid-cols-[145px_1fr] gap-x-4 gap-y-3 text-[15px]">
                <Row label="User ID" value={c.userId} mono />
                <Row label="Email" value={c.email} />
                <Row label="Company" value={c.company} hideEmpty />
                <Row label="Location" value={c.location} />
                <Row label="Last active" value={c.lastActive ? ago(c.lastActive) : null} empty="Hasn't written yet" />
                <Row label="WhatsApp" value={c.wa === "ON" ? "On WhatsApp" : c.wa === "NOT_FOUND" ? "Not found on WhatsApp" : null} empty="Not checked yet" />
                {Object.entries(c.vars).map(([k, v]) => (
                  <Row key={k} label={k === "appointment_time" ? "Appointment" : `custom.${k}`} value={v} />
                ))}
              </dl>

              {c.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span key={t} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[13px] font-medium text-emerald-800">
                      {tagLabel(t)}
                    </span>
                  ))}
                </div>
              )}

              {c.optedOut ? (
                <Box tone="bad" icon={ShieldAlert} title="Opted out">
                  <Field k="Date" v={day(c.optedOut.at)} />
                  <Field k="How" v={c.optedOut.reason ?? "Opted out"} />
                </Box>
              ) : c.consent.given ? (
                <Box tone="good" icon={ShieldCheck} title="Consent on file">
                  <Field k="Source" v={c.consent.source ?? "—"} />
                  {c.consent.date && <Field k="Date" v={day(c.consent.date)} />}
                  {c.consent.proof && <Field k="Proof" v={c.consent.proof} />}
                </Box>
              ) : (
                <Box tone="warn" icon={ShieldAlert} title="No consent on file">
                  <p className="text-[14px] text-amber-900">Campaigns won&apos;t message this person. Edit the contact and choose &ldquo;Yes&rdquo; once they&apos;ve agreed.</p>
                </Box>
              )}

              {c.segments.length > 0 && (
                <section className="mt-6">
                  <p className="text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">Segments</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.segments.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-1.5 text-[14.5px] text-stone-800 ring-1 ring-stone-200">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEGMENT_COLORS[s.color as SegmentColor] ?? SEGMENT_COLORS.green }} /> {s.name}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <section className="mt-6">
                <p className="text-[12.5px] font-semibold uppercase tracking-wider text-stone-400">Activity</p>
                <ol className="mt-3">
                  {c.activity.map((a, i) => {
                    const Icon = ACT_ICON[a.kind];
                    return (
                      <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                        {i < c.activity.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-36px)] w-px bg-emerald-100" />}
                        <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", a.kind === "failed" || a.kind === "opted_out" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="pt-0.5">
                          <span className="block text-[15px] text-stone-900">{a.text}</span>
                          <span className="block text-[13.5px] text-stone-500">{a.kind === "added" ? day(a.at) : stamp(a.at)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          )}
        </aside>
      </div>
    </Portal>
  );
}

function Row({ label, value, mono, empty = "—", hideEmpty }: { label: string; value: string | null; mono?: boolean; empty?: string; hideEmpty?: boolean }) {
  if (!value && hideEmpty) return null;
  return (
    <>
      <dt className="break-words text-stone-500">{label}</dt>
      <dd className={cx("min-w-0 break-words", value ? "text-stone-900" : "text-stone-400", mono && value && "font-mono text-[14px]")}>{value || empty}</dd>
    </>
  );
}

function Box({ tone, icon: Icon, title, children }: { tone: "good" | "bad" | "warn"; icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  const t = { good: "bg-emerald-50/70 ring-emerald-200 text-emerald-800", bad: "bg-rose-50 ring-rose-200 text-rose-700", warn: "bg-amber-50 ring-amber-200 text-amber-800" }[tone];
  return (
    <div className={cx("mt-6 rounded-2xl p-4 ring-1", t)}>
      <p className="flex items-center gap-2 text-[16px] font-semibold">
        <Icon className="h-5 w-5" aria-hidden /> {title}
      </p>
      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-[14.5px]">{children}</dl>
    </div>
  );
}
const Field = ({ k, v }: { k: string; v: string }) => (
  <>
    <dt className="text-stone-500">{k}</dt>
    <dd className="text-stone-900">{v}</dd>
  </>
);

const input = "mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[15px] text-stone-900 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100";

/** Edit mode: every field, tags, custom fields and consent. */
function EditContact({ c, tags: known, onCancel, onSaved }: { c: WaContactDetail; tags: string[]; onCancel: () => void; onSaved: () => void }) {
  const dial = [...new Set(DIAL_CODES.map((d) => d.dial))].sort((a, b) => b.length - a.length).find((d) => c.phone.startsWith(d)) ?? "91";
  const [f, setF] = useState({ name: c.name === "No name" ? "" : c.name, dial, local: c.phone.slice(dial.length), email: c.email ?? "", userId: c.userId ?? "", company: c.company ?? "", location: c.location ?? "" });
  const [tags, setTags] = useState(c.tags);
  const [tagText, setTagText] = useState("");
  const [vars, setVars] = useState<[string, string][]>(Object.entries(c.vars));
  const [consent, setConsent] = useState(c.consent.given);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const addTag = (raw: string) => {
    const t = waTag(raw);
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagText("");
  };
  const label = "block text-[13.5px] font-medium text-stone-600";

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await updateWaContactAction(c.id, {
            ...f,
            phone: `+${f.dial}${f.local.replace(/\D/g, "").replace(/^0+/, "")}`,
            tags: tagText.trim() ? [...tags, tagText] : tags,
            vars: Object.fromEntries(vars.filter(([k]) => k.trim())),
            consent,
          });
          if (!r.ok) return setError(r.error);
          onSaved();
        });
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-7 pb-6">
        <h2 className="text-[21px] font-semibold text-stone-900">Edit contact</h2>
        <label className="block">
          <span className={label}>Name</span>
          <input className={input} value={f.name} onChange={set("name")} required maxLength={160} autoFocus />
        </label>
        <div>
          <span className={label}>Phone number</span>
          <div className="flex gap-2">
            <span className="w-[112px] shrink-0">
              <select className={input} value={f.dial} onChange={set("dial")} aria-label="Country code">
                {DIAL_CODES.map((d) => (
                  <option key={d.iso} value={d.dial}>
                    {d.iso} +{d.dial}
                  </option>
                ))}
              </select>
            </span>
            <input className={input} value={f.local} onChange={set("local")} inputMode="tel" required aria-label="Phone number" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>User ID</span>
            <input className={cx(input, "font-mono text-[14px]")} value={f.userId} onChange={set("userId")} maxLength={120} />
          </label>
          <label className="block">
            <span className={label}>Email</span>
            <input className={input} type="email" value={f.email} onChange={set("email")} />
          </label>
          <label className="block">
            <span className={label}>Company</span>
            <input className={input} value={f.company} onChange={set("company")} maxLength={200} />
          </label>
          <label className="block">
            <span className={label}>Location</span>
            <input className={input} value={f.location} onChange={set("location")} placeholder="City, State" maxLength={200} />
          </label>
        </div>
        <div>
          <span className={label}>Tags</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-2">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[13.5px] font-medium text-emerald-800">
                {tagLabel(t)}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
            <input
              className="min-w-[120px] flex-1 bg-transparent px-1 text-[15px] outline-none"
              value={tagText}
              list="contact-known-tags"
              onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value.slice(0, -1)) : setTagText(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagText.trim()) {
                  e.preventDefault();
                  addTag(tagText);
                }
              }}
              placeholder={tags.length ? "" : "Type a tag and press Enter"}
              aria-label="Tags"
            />
            <datalist id="contact-known-tags">
              {known.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        <div>
          <span className={label}>Custom fields</span>
          <p className="text-[12.5px] text-stone-500">Usable in templates as {"{{name}}"}.</p>
          <div className="mt-2 space-y-2">
            {vars.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <input className={cx(input, "mt-0 w-[38%] font-mono text-[13.5px]")} value={k} onChange={(e) => setVars(vars.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} placeholder="last_order" aria-label="Field name" />
                <input className={cx(input, "mt-0")} value={v} onChange={(e) => setVars(vars.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} placeholder="Value" aria-label="Field value" />
                <button type="button" onClick={() => setVars(vars.filter((_, j) => j !== i))} className="rounded-lg px-2 text-stone-400 hover:bg-stone-100 hover:text-rose-600" aria-label="Remove field">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setVars([...vars, ["", ""]])} className="mt-2 inline-flex items-center gap-1 text-[14px] font-medium text-emerald-700 hover:text-emerald-900">
            <Plus className="h-4 w-4" aria-hidden /> Add field
          </button>
        </div>
        <div>
          <span className={label}>WhatsApp opted in</span>
          {c.optedOut ? (
            <p className="mt-1 rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">Opted out {c.optedOut.reason ? `(${c.optedOut.reason})` : ""}. To message them again, remove the number from your do-not-contact list first.</p>
          ) : (
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="WhatsApp opted in">
              {([true, false] as const).map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={consent === v} onClick={() => setConsent(v)} className={cx("flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] ring-1", consent === v ? "bg-emerald-50 font-medium ring-2 ring-emerald-500" : "ring-stone-200")}>
                  <span className={cx("grid h-4 w-4 place-items-center rounded-full ring-2", consent === v ? "ring-emerald-600" : "ring-stone-300")}>{consent === v && <span className="h-2 w-2 rounded-full bg-emerald-600" />}</span>
                  {v ? "Yes, they agreed" : "No"}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
            {error}
          </p>
        )}
      </div>
      <div className="grid grid-cols-[1fr_1.5fr] gap-3 border-t border-stone-100 px-7 py-4">
        <button type="button" className={btn.secondary} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={btn.primary} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Save changes
        </button>
      </div>
    </form>
  );
}
