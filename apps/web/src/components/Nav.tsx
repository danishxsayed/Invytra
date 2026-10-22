"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; soon?: string }[] = [
  { href: "/app", label: "Overview" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/inbox", label: "Inbox" },
  { href: "/app/accounts", label: "Accounts", soon: "Next" },
  { href: "/app/leads", label: "Leads", soon: "Soon" },
  { href: "/app/campaigns", label: "Campaigns", soon: "Soon" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
      {ITEMS.map((item) => {
        const active = item.href === "/app" ? path === "/app" : path.startsWith(item.href);
        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-ink-faint"
              aria-disabled
            >
              {item.label}
              <span className="text-xs">{item.soon}</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-2 ${
              active ? "bg-white font-semibold text-ink shadow-[0_0_0_1px_theme(colors.line)]" : "text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
