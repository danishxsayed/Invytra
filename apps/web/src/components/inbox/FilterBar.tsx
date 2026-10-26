"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const selectCls =
  "min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[14px] text-stone-700 focus:outline-none focus:ring-4 focus:ring-brand-200";

/** Search plus account / campaign / tag filters; changes apply straight away. */
export function FilterBar({
  accounts,
  campaigns,
  tags,
}: {
  accounts: { id: string; label: string }[];
  campaigns: { id: string; name: string }[];
  tags: string[];
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const go = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("c");
    p.delete("page");
    router.push(`${path}${p.toString() ? `?${p}` : ""}`);
  };
  return (
    <div className="space-y-2 border-b border-stone-100 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go("q", q.trim());
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company or message"
          aria-label="Search conversations"
          className="w-full rounded-lg border border-stone-200 bg-white py-1.5 pl-8 pr-2 text-[14px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-4 focus:ring-brand-200"
        />
      </form>
      <div className="flex gap-2">
        {accounts.length > 1 && (
          <select aria-label="Account" className={selectCls} value={params.get("account") ?? ""} onChange={(e) => go("account", e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        {campaigns.length > 0 && (
          <select aria-label="Campaign" className={selectCls} value={params.get("campaign") ?? ""} onChange={(e) => go("campaign", e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {tags.length > 0 && (
          <select aria-label="Tag" className={selectCls} value={params.get("tag") ?? ""} onChange={(e) => go("tag", e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
