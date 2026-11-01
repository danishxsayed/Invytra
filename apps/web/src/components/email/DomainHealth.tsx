"use client";

import type { DnsItem, DnsStatus, DomainDns } from "@invytra/db";
import { AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { useState } from "react";
import { cx } from "../ui";

const LABEL = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC", mx: "MX" } as const;
const WHAT: Record<keyof typeof LABEL, string> = {
  spf: "says which servers may send for your domain",
  dkim: "signs your emails so they can't be faked",
  dmarc: "tells inboxes what to do with unsigned mail",
  mx: "lets replies reach your mailbox",
};
const LOOK: Record<DnsStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", Icon: CheckCircle2 },
  warn: { cls: "bg-amber-50 text-amber-800 ring-amber-600/25", Icon: AlertTriangle },
  missing: { cls: "bg-rose-50 text-rose-700 ring-rose-600/20", Icon: XCircle },
};

/** The domain's SPF / DKIM / DMARC / MX as pills; opens to what was found and how to fix it. */
export function DomainHealth({ dns }: { dns: DomainDns }) {
  const keys = Object.keys(LABEL) as (keyof typeof LABEL)[];
  const problems = keys.filter((k) => dns[k].status !== "ok").length;
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 text-left">
        <span className="text-[14px] font-medium text-stone-700">Domain health · {dns.domain}</span>
        {keys.map((k) => {
          const { cls, Icon } = LOOK[dns[k].status];
          return (
            <span key={k} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium ring-1", cls)}>
              <Icon className="h-3.5 w-3.5" aria-hidden /> {LABEL[k]}
            </span>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1 text-[13px] text-stone-500">
          {problems ? `${problems} to fix` : "All set"}
          <ChevronDown className={cx("h-4 w-4 transition", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-t border-stone-200 pt-2">
          {keys.map((k) => (
            <Line key={k} name={LABEL[k]} what={WHAT[k]} item={dns[k]} />
          ))}
          <li className="text-[13px] text-stone-500">DNS changes can take up to a few hours to show. Press “Check again” after you add a record.</li>
        </ul>
      )}
    </div>
  );
}

function Line({ name, what, item }: { name: string; what: string; item: DnsItem }) {
  const { Icon } = LOOK[item.status];
  const color = item.status === "ok" ? "text-emerald-600" : item.status === "warn" ? "text-amber-600" : "text-rose-600";
  return (
    <li className="flex items-start gap-2 text-[14px]">
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", color)} aria-hidden />
      <div className="min-w-0">
        <p>
          <span className="font-semibold text-stone-900">{name}</span> <span className="text-stone-500">({what})</span>
        </p>
        <p className="break-words text-stone-700">{item.detail}</p>
        {item.fix && <p className="mt-0.5 break-words rounded bg-white px-2 py-1 font-mono text-[12.5px] text-stone-800 ring-1 ring-stone-200">{item.fix}</p>}
      </div>
    </li>
  );
}
