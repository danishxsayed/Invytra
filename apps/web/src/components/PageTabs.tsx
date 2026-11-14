import type { LucideIcon } from "lucide-react";
import { cx } from "./ui";

export interface PageTab {
  id: string;
  label: string;
  icon?: LucideIcon;
}

/** Tabs that are links (?tab=…), so each tab has its own address and works without JavaScript. The first tab is the page itself. */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl bg-stone-200/50 p-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <a
                href={i === 0 ? "?" : `?tab=${t.id}`}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[14.5px] font-medium transition",
                  on ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:bg-white/60 hover:text-stone-900",
                )}
              >
                {t.icon && <t.icon className={cx("h-4 w-4", on ? "text-stone-700" : "text-stone-400")} aria-hidden />}
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The tab asked for in the address, or the first one. */
export const pickTab = (tabs: readonly PageTab[], asked: string | undefined) => (tabs.some((t) => t.id === asked) ? asked! : tabs[0]!.id);
