"use client";

import { SEGMENT_COLORS, describeSegment, tagColor, tagLabel, type SegmentColor } from "@invytra/shared";
import { Check, Filter, Loader2, Pencil, Search, SlidersHorizontal, Tag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteSegmentsAction, deleteWaTagsAction, renameSegmentAction, renameWaTagAction } from "@/app/whatsapp/contacts/actions";
import { btn } from "../../btn";
import { Portal } from "../../Portal";
import { cx } from "../../ui";
import { SegmentDialog, type SegmentDraft } from "./SegmentDialog";

export interface SegmentRow extends SegmentDraft {
  id: string;
  count: number;
}

/** Manage tags & segments: search, rename, delete one or many. Contacts are never deleted here. */
export function ManageTagsDialog({ tags, segments, start: startTab, onClose }: { tags: { tag: string; count: number }[]; segments: SegmentRow[]; start: "tags" | "segments"; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState(startTab);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [editSeg, setEditSeg] = useState<SegmentRow | null>(null);
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editSeg) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, editSeg]);
  useEffect(() => (setPicked(new Set()), setQ(""), setEditing(null), setConfirm(null)), [tab]);

  const usedIn = (t: string) => segments.filter((s) => s.rules.some((r) => r.field === "tag" && r.value === t)).length;
  const items =
    tab === "tags"
      ? tags.filter((t) => t.tag.includes(q.trim().toLowerCase())).map((t) => ({ key: t.tag, name: tagLabel(t.tag), color: tagColor(t.tag), sub: `${t.count.toLocaleString("en-US")} contact${t.count === 1 ? "" : "s"}${usedIn(t.tag) ? ` · used in ${usedIn(t.tag)} segment${usedIn(t.tag) === 1 ? "" : "s"}` : ""}` }))
      : segments.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).map((s) => ({ key: s.id, name: s.name, color: SEGMENT_COLORS[s.color] ?? SEGMENT_COLORS.green, sub: `${s.count.toLocaleString("en-US")} contacts · ${describeSegment(s)}` }));
  const all = items.length > 0 && items.every((i) => picked.has(i.key));
  const go = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    run(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "That didn't work.");
      setEditing(null);
      setConfirm(null);
      setPicked(new Set());
      router.refresh();
    });
  const rename = (key: string, value: string) => go(() => (tab === "tags" ? renameWaTagAction(key, value) : renameSegmentAction(key, value)));
  const remove = (keys: string[]) => go(() => (tab === "tags" ? deleteWaTagsAction(keys) : deleteSegmentsAction(keys)));
  const nameOf = (k: string) => items.find((i) => i.key === k)?.name ?? k;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="manage-title">
        <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="px-6 pb-4 pt-6 sm:px-7">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <SlidersHorizontal className="h-5 w-5" aria-hidden />
              </span>
              <div className="flex-1">
                <h2 id="manage-title" className="text-[21px] font-semibold text-stone-900">
                  Manage tags &amp; segments
                </h2>
                <p className="text-[15px] text-stone-500">Rename or delete in bulk. Contacts themselves are never deleted here.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-stone-100 p-1" role="tablist">
                {(
                  [
                    ["tags", "Tags", Tag, tags.length],
                    ["segments", "Segments", Filter, segments.length],
                  ] as const
                ).map(([id, l, Icon, n]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[15px]", tab === id ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500")}>
                    <Icon className="h-4 w-4" aria-hidden /> {l} <span className="text-stone-400">{n}</span>
                  </button>
                ))}
              </div>
              <label className="relative w-full max-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}`} className="w-full rounded-xl border border-stone-200 py-2.5 pl-9 pr-3 text-[15px] focus:border-emerald-400 focus:outline-none" />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3 border-y border-stone-100 bg-stone-50/70 px-6 py-3 sm:px-7">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={all} onChange={() => setPicked(all ? new Set() : new Set(items.map((i) => i.key)))} aria-label="Select all" disabled={!items.length} />
            <span className="text-[14.5px] text-stone-600">{picked.size ? `${picked.size} selected` : "Select all"}</span>
            {picked.size > 0 && (
              <button type="button" onClick={() => setConfirm([...picked])} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[14px] font-medium text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" aria-hidden /> Delete {picked.size}
              </button>
            )}
          </div>
          {confirm && (
            <div className="flex flex-wrap items-center gap-3 bg-rose-50 px-6 py-3 text-[14px] text-rose-900 sm:px-7">
              <span className="flex-1">
                Delete {confirm.length === 1 ? `"${nameOf(confirm[0]!)}"` : `${confirm.length} ${tab}`}? {tab === "tags" ? "It's removed from contacts (they stay), and from segment rules." : "Their contacts stay; campaigns already sent are kept."}
              </span>
              <button type="button" disabled={pending} onClick={() => remove(confirm)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white">
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete
              </button>
              <button type="button" onClick={() => setConfirm(null)} className="font-medium underline">
                Cancel
              </button>
            </div>
          )}
          {error && <p className="bg-rose-50 px-7 py-2 text-[14px] text-rose-800">{error}</p>}
          <ul className="min-h-[200px] flex-1 divide-y divide-stone-100 overflow-y-auto px-6 sm:px-7">
            {!items.length && <li className="py-10 text-center text-[14.5px] text-stone-500">{q ? "Nothing matches." : tab === "tags" ? "No tags yet. Add them when importing or to selected contacts." : "No segments yet."}</li>}
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-4 py-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={picked.has(i.key)}
                  onChange={() =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (n.has(i.key)) n.delete(i.key);
                      else n.add(i.key);
                      return n;
                    })
                  }
                  aria-label={`Select ${i.name}`}
                />
                <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: i.color }} />
                {editing?.key === i.key ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing.value.trim()) rename(i.key, editing.value);
                    }}
                  >
                    <input autoFocus value={editing.value} onChange={(e) => setEditing({ key: i.key, value: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-[15px] focus:outline-none" aria-label="New name" maxLength={80} />
                    <button type="submit" disabled={pending} className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white" aria-label="Save">
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100" aria-label="Cancel">
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium text-stone-900">{i.name}</span>
                    <span className="block truncate text-[14px] text-stone-500">{i.sub}</span>
                  </span>
                )}
                {editing?.key !== i.key && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const seg = segments.find((s) => s.id === i.key);
                        if (tab === "segments" && seg) setEditSeg(seg);
                        else setEditing({ key: i.key, value: i.name });
                      }}
                      className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      aria-label={`Edit ${i.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setConfirm([i.key])} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${i.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4 border-t border-stone-100 px-6 py-4 sm:px-7">
            <p className="text-[14px] text-stone-500">{tab === "tags" ? "Deleting a tag removes it from contacts — it doesn't delete them." : "Deleting a segment never deletes its contacts."}</p>
            <button type="button" className={cx(btn.primary, "px-5")} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
      {editSeg && <SegmentDialog tags={tags.map((t) => t.tag)} initial={{ ...editSeg, color: (editSeg.color in SEGMENT_COLORS ? editSeg.color : "green") as SegmentColor }} onClose={() => setEditSeg(null)} />}
    </Portal>
  );
}
