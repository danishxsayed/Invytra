"use client";

import { Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, EmptyState } from "./ui";

export interface ReplyItem {
  id: string;
  fromName: string;
  text: string;
  when: string;
  account: string;
}

export function InboxList({ items, showAccount }: { items: ReplyItem[]; showAccount: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.fromName} ${i.text}`.toLowerCase().includes(s)) : items;
  }, [q, items]);
  return (
    <>
      <div className="border-b border-stone-100 p-3">
        <label className="relative block">
          <span className="sr-only">Search replies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or message"
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-[16px] placeholder:text-stone-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-200"
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Inbox} title={q ? "No matches" : "No replies yet"} body={q ? "Try a different name or word." : "When someone answers an invite or message, it shows up here."} />
      ) : (
        <ul className="divide-y divide-stone-100">
          {shown.map((m) => (
            <li key={m.id} className="flex gap-3 px-5 py-4 hover:bg-stone-50/60">
              <Avatar name={m.fromName} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[16px] font-medium text-stone-900">{m.fromName}</span>
                  <span className="shrink-0 text-[14px] text-stone-400">
                    {m.when}
                    {showAccount && ` · ${m.account}`}
                  </span>
                </p>
                <p className="mt-0.5 max-w-prose text-[16px] text-stone-600">{m.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
