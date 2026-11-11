"use client";

import { ExternalLink, Mail, Phone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { SocialLink } from "@invytra/shared";
import { unsaveBusinessAction } from "@/app/workspace/invy/actions";
import { SocialLinks } from "./SocialLinks";

type Row = { id: string; name: string; category: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; mapsUrl: string | null; opportunity: string | null; emailed: boolean; socials: SocialLink[] };

export function SavedList({ rows, searchHref }: { rows: Row[]; searchHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-[15px] text-stone-500">
        Nothing saved yet. <a href={searchHref} className="font-medium text-stone-900 underline">Ask Invy</a> to find businesses, then add the good ones to your leads.
      </p>
    );
  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-stone-900">
              {r.name}
              {r.emailed && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">In an email campaign</span>}
            </p>
            <p className="text-[13px] text-stone-500">{[r.category, r.address].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone-600">
              {r.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-stone-400" aria-hidden />{r.phone}</span>}
              {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3.5 w-3.5 text-stone-400" aria-hidden />{r.email}</a>}
              {r.opportunity && <span className="text-stone-500">Opportunity: <span className="font-medium text-stone-800">{r.opportunity}</span></span>}
            </p>
            <SocialLinks links={r.socials} className="mt-1.5" />
          </div>
          <div className="flex items-center gap-1">
            {r.mapsUrl && (
              <a href={r.mapsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${r.name} in Google Maps`} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
            <button
              type="button"
              disabled={pending}
              aria-label={`Remove ${r.name}`}
              onClick={() =>
                start(async () => {
                  await unsaveBusinessAction(r.id);
                  router.refresh();
                })
              }
              className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
