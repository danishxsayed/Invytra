"use client";

import { FileText, Smartphone, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { cx } from "../ui";

const LIVE = [
  { href: "/whatsapp/contacts", end: "/contacts", label: "Contacts", Icon: Users },
  { href: "/whatsapp/templates", end: "/templates", label: "Templates", Icon: FileText },
  { href: "/whatsapp/number", end: "/number", label: "Number", Icon: Smartphone },
];
const SOON = ["Campaigns", "Inbox"];

/** The WhatsApp tabs; works on its own subdomain and on one host (/whatsapp/…). */
export function WhatsappNav() {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="WhatsApp" className="flex flex-wrap items-center gap-1">
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
