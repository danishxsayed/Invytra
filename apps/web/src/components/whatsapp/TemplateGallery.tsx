"use client";

import { waLanguageLabel, waStatusInfo, readMetaComponents } from "@invytra/shared";
import { AlertCircle, Copy, Hourglass, Loader2, MoreVertical, PauseCircle, RefreshCw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteTemplateAction, syncTemplatesAction } from "@/app/whatsapp/actions";
import { btn } from "../AccountControls";
import { cx } from "../ui";
import { WaBubble, WaChatBackground } from "./WaBubble";

export interface TemplateCardData {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectedReason: string | null;
  quality: string | null;
  components: unknown;
  updated: string;
}

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "approved", label: "Approved", test: (s: string) => s === "APPROVED" },
  { id: "review", label: "In review", test: (s: string) => s === "PENDING" || s === "IN_APPEAL" },
  { id: "rejected", label: "Rejected", test: (s: string) => s === "REJECTED" },
  { id: "paused", label: "Paused", test: (s: string) => ["PAUSED", "DISABLED", "LIMIT_EXCEEDED"].includes(s) },
] as const;

const BADGE = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  stone: "bg-stone-100 text-stone-600 ring-stone-200",
};
const CAT = { MARKETING: "bg-orange-50 text-orange-700", UTILITY: "bg-sky-50 text-sky-700", AUTHENTICATION: "bg-violet-50 text-violet-700" } as Record<string, string>;
const QUALITY: Record<string, { label: string; dot: string }> = { GREEN: { label: "High quality", dot: "bg-emerald-500" }, YELLOW: { label: "Medium quality", dot: "bg-amber-500" }, RED: { label: "Low quality", dot: "bg-rose-500" } };

/** Meta's rejection codes, in plain words. */
const REASON: Record<string, string> = {
  INVALID_FORMAT: "The format was refused: check variables, links and buttons.",
  PROMOTIONAL: "Promotional wording isn't allowed in a Utility template. Submit it as Marketing.",
  TAG_CONTENT_MISMATCH: "The category doesn't match the message. Pick the category that fits it.",
  SCAM: "Meta flagged the wording as possibly misleading.",
  ABUSIVE_CONTENT: "Meta flagged the wording as abusive.",
  INCORRECT_CATEGORY: "The category doesn't match the message.",
};

/** The template cards: filter by status, search, sync with Meta, delete, copy into a new one. */
export function TemplateGallery({ templates, syncedLabel }: { templates: TemplateCardData[]; syncedLabel: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [syncing, startSync] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, templates.filter((t) => f.test(t.status)).length])), [templates]);
  const shown = templates.filter(
    (t) => FILTERS.find((f) => f.id === filter)!.test(t.status) && (!cat || t.category === cat) && (!q.trim() || `${t.name} ${readMetaComponents(t.components).body}`.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-stone-100/80 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cx("rounded-lg px-3 py-1.5 text-[14px] font-medium transition", filter === f.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900")}
            >
              {f.label} <span className="text-stone-400">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search templates</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="w-56 rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-[14px] focus:border-stone-400 focus:outline-none" />
          </label>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14px]">
            <option value="">All categories</option>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
          <button
            type="button"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const r = await syncTemplatesAction();
                setMsg(r.ok ? null : r.error);
                router.refresh();
              })
            }
            className={btn.secondary}
            title={syncedLabel}
          >
            <RefreshCw className={cx("h-4 w-4", syncing && "animate-spin")} aria-hidden /> Sync with Meta
          </button>
        </div>
      </div>
      {msg && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-800">
          {msg}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-[16px] font-medium text-stone-800">{templates.length ? "No templates match" : "No templates yet"}</p>
          <p className="mt-1 text-[14px] text-stone-500">{templates.length ? "Try another status, category or search." : "Create your first one: Meta usually reviews it within minutes."}</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <TemplateCard key={t.id} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateCard({ t }: { t: TemplateCardData }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const st = waStatusInfo(t.status);
  const view = readMetaComponents(t.components);
  const quality = t.quality ? QUALITY[t.quality] : undefined;
  const reason = t.rejectedReason ? (REASON[t.rejectedReason] ?? t.rejectedReason.toLowerCase().replace(/_/g, " ")) : null;

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
      <WaChatBackground className="relative h-[230px] overflow-hidden px-4 pb-4 pt-11">
        <span className={cx("absolute right-3 top-3 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1", BADGE[st.tone])}>{st.label}</span>
        <WaBubble t={view} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#efe7dd] to-transparent" />
      </WaChatBackground>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-[14.5px] font-semibold text-stone-900" title={t.name}>
            {t.name}
          </p>
          <div className="relative">
            <button type="button" aria-label={`More for ${t.name}`} onClick={() => setMenu((m) => !m)} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100">
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 z-10 w-44 rounded-xl bg-white p-1 text-[14px] shadow-lg ring-1 ring-stone-200" onMouseLeave={() => setMenu(false)}>
                <a href={`/whatsapp/templates/new?copy=${t.id}`} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-stone-700 hover:bg-stone-50">
                  <Copy className="h-4 w-4" aria-hidden /> Copy into new
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setConfirm(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-stone-500">
          <span className={cx("rounded px-1.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide", CAT[t.category] ?? "bg-stone-100 text-stone-600")}>{t.category.toLowerCase()}</span>
          <span>{waLanguageLabel(t.language)}</span>
          {quality && (
            <span className="inline-flex items-center gap-1">
              <span className={cx("h-1.5 w-1.5 rounded-full", quality.dot)} /> {quality.label}
            </span>
          )}
        </p>
        {t.status === "REJECTED" && (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {reason ?? "Meta rejected it."} Copy it into a new template, change it, and submit again.
          </p>
        )}
        {(t.status === "PENDING" || t.status === "IN_APPEAL") && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> In review by Meta, usually within minutes, at most 24 hours.
          </p>
        )}
        {["PAUSED", "DISABLED"].includes(t.status) && (
          <p className="flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-[13px] text-stone-700">
            <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {t.status === "PAUSED" ? "Paused by Meta because people blocked or reported it. It resumes by itself after a few hours." : "Disabled by Meta after repeated low quality. Write a new one."}
          </p>
        )}
        <p className="mt-auto pt-1 text-[12.5px] text-stone-400">Updated {t.updated}</p>
        {confirm && (
          <div className="rounded-lg bg-rose-50 p-3 text-[13.5px] text-rose-900 ring-1 ring-rose-200">
            <p>Delete it from your Meta account too? You can&apos;t reuse this name for 30 days.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteTemplateAction(t.id);
                    if (!r.ok) return setErr(r.error);
                    router.refresh();
                  })
                }
                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Delete
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="font-medium underline">
                Keep
              </button>
            </div>
            {err && <p className="mt-2 text-rose-800">{err}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
