"use client";

import { tagColor, tagLabel } from "@invytra/shared";
import { BellOff, Eye, Mail, MapPin, Megaphone, MessageCircle, Pencil, Phone, Plus, Trash2, UserPlus, X, CircleAlert, Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { tagWaContactsAction } from "@/app/whatsapp/contacts/actions";
import { addNoteAction, deleteNoteAction, tagChatAction } from "@/app/whatsapp/inbox/actions";
import type { WaActivity, WaContactDetail } from "@/lib/whatsapp-contact-detail";
import { cx } from "../../ui";
import { ContactPanel } from "../contacts/ContactPanel";
import { exclusive } from "./busy";
import { initials } from "./ChatList";
import type { Note } from "./Messages";

const ACT_ICON: Record<WaActivity["kind"], typeof MessageCircle> = { added: UserPlus, sent: Megaphone, delivered: Megaphone, read: Eye, failed: CircleAlert, replied: MessageCircle, wrote: MessageCircle, opted_out: Ban };
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Who you're talking to: details, tags, notes for the team, activity. */
export function ChatSide({ c, notes, createdAt, knownTags, me, onChanged }: { c: WaContactDetail; notes: Note[]; createdAt: string; knownTags: string[]; me: string; onChanged: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hue = tagColor(c.name);
  const since = new Date(createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      if ((await exclusive(fn)).ok) onChanged();
    });
  const campaign = () =>
    start(async () => {
      const d = new Date();
      const t = `selected-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
      const r = await tagWaContactsAction([c.id], t, true);
      if (r.ok) router.push(`/whatsapp/campaigns/new?tag=${encodeURIComponent(t)}`);
    });
  const row = "grid grid-cols-[22px_92px_1fr] items-center gap-2 text-[14.5px]";

  return (
    <div className="space-y-6 p-5">
      <div>
        <span className="grid h-16 w-16 place-items-center rounded-full text-[20px] font-bold ring-4" style={{ background: `${hue}1f`, color: hue, ["--tw-ring-color" as string]: `${hue}26` }}>
          {initials(c.name)}
        </span>
        <h2 className="mt-3 text-[20px] font-semibold text-stone-900">{c.name}</h2>
        <p className="text-[14px] text-stone-500">Contact since {since}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEdit(true)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[14px] font-medium ring-1 ring-stone-200 hover:bg-stone-50">
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </button>
          <button type="button" onClick={campaign} disabled={pending || !c.consent.given || !!c.optedOut} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[14px] font-medium ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-50">
            <Megaphone className="h-4 w-4" aria-hidden /> Start campaign
          </button>
        </div>
      </div>

      <section className="space-y-2.5">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Details</p>
        <p className={row}>
          <Phone className="h-4 w-4 text-stone-400" aria-hidden /> <span className="text-stone-500">Phone</span> <span className="tabular-nums text-stone-900">{c.phonePretty}</span>
        </p>
        <p className={row}>
          <Mail className="h-4 w-4 text-stone-400" aria-hidden /> <span className="text-stone-500">Email</span> <span className="truncate text-stone-900">{c.email ?? <span className="text-stone-400">—</span>}</span>
        </p>
        <p className={row}>
          <MapPin className="h-4 w-4 text-stone-400" aria-hidden /> <span className="text-stone-500">Location</span> <span className="text-stone-900">{c.location ?? <span className="text-stone-400">—</span>}</span>
        </p>
        <p className={row}>
          <MessageCircle className="h-4 w-4 text-stone-400" aria-hidden /> <span className="text-stone-500">WhatsApp</span> <span className="text-stone-900">{c.wa === "ON" ? "Verified" : c.wa === "NOT_FOUND" ? "Not found" : "Not checked"}</span>
        </p>
        <p className={row}>
          <BellOff className="h-4 w-4 text-stone-400" aria-hidden /> <span className="text-stone-500">Opt-out</span> <span className={c.optedOut ? "text-rose-700" : "text-stone-900"}>{c.optedOut ? "Opted out" : c.consent.given ? "Subscribed" : "Not opted in"}</span>
        </p>
      </section>

      <section>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Tags</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[13.5px] font-medium text-emerald-800">
              {tagLabel(t)}
              <button type="button" onClick={() => run(() => tagChatAction(c.id, t, false))} aria-label={`Remove ${t}`} className="text-emerald-600 hover:text-emerald-900">
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
          {tag === null ? (
            <button type="button" onClick={() => setTag("")} className="rounded-lg border border-dashed border-stone-300 px-2.5 py-1 text-[13.5px] text-stone-600 hover:border-emerald-400">
              + Add tag
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tag.trim()) run(() => tagChatAction(c.id, tag, true));
                setTag(null);
              }}
            >
              <input autoFocus list="inbox-tags" value={tag} onChange={(e) => setTag(e.target.value)} onBlur={() => setTag(null)} placeholder="Tag" className="w-28 rounded-lg border border-emerald-300 px-2 py-1 text-[13.5px] outline-none" aria-label="New tag" />
              <datalist id="inbox-tags">
                {knownTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </form>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Notes · {notes.length}</p>
          <button type="button" onClick={() => setNote("")} className="inline-flex items-center gap-1 text-[14px] font-medium text-orange-600 hover:text-orange-700">
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
        </div>
        {note !== null && (
          <div className="mt-2 space-y-2">
            <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] outline-none" placeholder="Only your team sees notes" aria-label="Note" />
            <div className="flex justify-end gap-3 text-[14px]">
              <button type="button" onClick={() => setNote(null)} className="text-stone-500">
                Cancel
              </button>
              <button type="button" disabled={!note.trim() || pending} onClick={() => (run(() => addNoteAction(c.id, note)), setNote(null))} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                Save note
              </button>
            </div>
          </div>
        )}
        <div className="mt-2 space-y-2">
          {[...notes].reverse().map((n) => (
            <div key={n.id} className="group rounded-xl bg-amber-50 p-3 text-[14px] text-stone-800 ring-1 ring-amber-200">
              <p className="whitespace-pre-wrap break-words">{n.body}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-orange-700">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[9px] font-bold text-stone-700 ring-1 ring-stone-200">{initials(n.by)}</span>
                {n.by} · {stamp(n.at)}
                {n.userId === me && (
                  <button type="button" onClick={() => run(() => deleteNoteAction(n.id))} className="ml-auto text-amber-500 opacity-0 hover:text-rose-600 group-hover:opacity-100" aria-label="Delete note">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">Activity</p>
        <ol className="mt-3">
          {c.activity.slice(0, 8).map((a, i) => {
            const Icon = ACT_ICON[a.kind];
            return (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < Math.min(8, c.activity.length) - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-32px)] w-px bg-emerald-100" />}
                <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full", a.kind === "failed" || a.kind === "opted_out" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[14px] text-stone-900">{a.text}</span>
                  <span className="block text-[12.5px] text-stone-500">{stamp(a.at)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      {edit && (
        <ContactPanel
          id={c.id}
          tags={knownTags}
          onClose={() => {
            setEdit(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
