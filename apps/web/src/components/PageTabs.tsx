"use client";

import Link from "next/link";
import { cx } from "./ui";

export interface PageTab {
  id: string;
  label: string;
  /** An icon element, e.g. <CreditCard /> (sized and coloured here). */
  icon?: React.ReactNode;
}

/** Tabs that are links (?tab=…): each tab has its own address, and switching only swaps the content (no page reload). The first tab is the page itself. */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl bg-stone-200/50 p-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={i === 0 ? "?" : `?tab=${t.id}`} // relative: the same page on any host (app.invytra.com/billing or /workspace/billing)
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[14.5px] font-medium transition",
                  on ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:bg-white/60 hover:text-stone-900",
                )}
              >
                {t.icon && <span aria-hidden className={cx("[&>svg]:h-4 [&>svg]:w-4", on ? "text-stone-700" : "text-stone-400")}>{t.icon}</span>}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

