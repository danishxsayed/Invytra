"use client";

import { Flame, Mail, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

const LIVE = [
  { href: "/email/mailboxes", end: "/mailboxes", label: "Mailboxes", Icon: Mail },
  { href: "/email/warmup", end: "/warmup", label: "Warm-up", Icon: Flame },
  { href: "/email/campaigns", end: "/campaigns", label: "Campaigns", Icon: Send },
];
const SOON = ["Inbox"];

/** The Email Outreach tabs; works on its own subdomain (/warmup) and on one host (/email/warmup). */
export function EmailNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Email" className="flex flex-wrap items-center gap-1">
      {LIVE.map(({ href, end, label, Icon }) => {
        const on = path.endsWith(end) || path.includes(`${end}/`);
        return (
          <a
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-medium transition", on ? "bg-brand-400 text-stone-900" : "text-stone-600 hover:bg-stone-100")}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </a>
        );
      })}
      {SOON.map((s) => (
        <span key={s} aria-disabled className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] text-stone-400">
          {s} <span className="rounded bg-stone-100 px-1 text-[11px] font-medium text-stone-500">Soon</span>
        </span>
      ))}
    </nav>
  );
}
