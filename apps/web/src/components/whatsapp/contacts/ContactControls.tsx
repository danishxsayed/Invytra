"use client";

import { tagLabel } from "@invytra/shared";
import { Plus, Search, SlidersHorizontal, Tag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cx } from "../../ui";
import { ManageTagsDialog, type SegmentRow } from "./ManageTagsDialog";
import { SegmentDialog } from "./SegmentDialog";

type Tags = { tag: string; count: number }[];

/** Search, tag and location filters above the table (kept in the address, page reset). */
export function ContactFilters({ tags, cities }: { tags: Tags; cities: { city: string; count: number }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const go = (k: string, v: string) => {
    const p = new URLSearchParams(sp);
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete("p");
    router.push(`${path}${p.size ? `?${p}` : ""}`, { scroll: false });
  };
  const box = "rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] text-stone-800 focus:border-emerald-400 focus:outline-none";
  return (
    <div className="flex flex-wrap gap-3">
      <form
        className="relative min-w-[240px] flex-1 sm:max-w-[420px]"
        onSubmit={(e) => {
          e.preventDefault();
          go("q", q.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (sp.get("q") ?? "") && go("q", q.trim())} placeholder="Search name, phone, email or user ID" className={cx(box, "w-full pl-10")} aria-label="Search contacts" />
      </form>
      <select className={cx(box, "min-w-[160px]")} value={sp.get("tag") ?? ""} onChange={(e) => go("tag", e.target.value)} aria-label="Tag">
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t.tag} value={t.tag}>
            {tagLabel(t.tag)} ({t.count})
          </option>
        ))}
      </select>
      <select className={cx(box, "min-w-[160px]")} value={sp.get("loc") ?? ""} onChange={(e) => go("loc", e.target.value)} aria-label="Location">
        <option value="">All locations</option>
        {cities.map((c) => (
          <option key={c.city} value={c.city}>
            {c.city} ({c.count})
          </option>
        ))}
      </select>
    </div>
  );
}

/** The segment buttons in the sidebar: header icons, "New segment", "Manage tags & segments". */
export function SegmentButtons({ variant, tags, segments }: { variant: "header" | "new" | "manage"; tags: Tags; segments: SegmentRow[] }) {
  const [open, setOpen] = useState<"new" | "tags" | "segments" | null>(null);
  return (
    <>
      {variant === "header" ? (
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen("segments")} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Manage segments">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setOpen("new")} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50" aria-label="New segment">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </span>
      ) : variant === "new" ? (
        <button type="button" onClick={() => setOpen("new")} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-[14.5px] text-stone-600 hover:border-emerald-400 hover:text-emerald-800">
          <Plus className="h-4 w-4" aria-hidden /> New segment
        </button>
      ) : (
        <button type="button" onClick={() => setOpen("tags")} className="flex items-center gap-2 whitespace-nowrap px-3 text-[14px] text-stone-600 hover:text-stone-900">
          <Tag className="h-4 w-4" aria-hidden /> Manage tags &amp; segments
        </button>
      )}
      {open === "new" && <SegmentDialog tags={tags.map((t) => t.tag)} onClose={() => setOpen(null)} />}
      {(open === "tags" || open === "segments") && <ManageTagsDialog tags={tags} segments={segments} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}
