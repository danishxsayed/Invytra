"use client";

import { ChevronRight, CreditCard, FileText, Inbox, LayoutGrid, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Settings, Smartphone, Users, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { ChannelLogo } from "../../ChannelLogo";
import { CreditsChip } from "../../credits/CreditsChip";
import { LogoMark } from "../../LogoMark";
import { Avatar, cx } from "../../ui";
import { Bell } from "./Bell";
import { PulseProvider, usePulse } from "./pulse";

export interface ShellProps {
  workspace: string;
  user: { name: string; role: string };
  collapsed: boolean;
  credits: { left: number; href: string | null };
  links: { hub: string; settings: string; billing: string | null };
  /** The plan banner (server-rendered), shown above the page. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

type Item = { href: string; label: string; Icon: typeof Inbox; badge?: "unread" };
const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "WhatsApp",
    items: [
      { href: "/whatsapp/inbox", label: "Inbox", Icon: Inbox, badge: "unread" },
      { href: "/whatsapp/campaigns", label: "Campaigns", Icon: Megaphone },
      { href: "/whatsapp/templates", label: "Templates", Icon: FileText },
      { href: "/whatsapp/contacts", label: "Contacts", Icon: Users },
    ],
  },
  { title: "Setup", items: [{ href: "/whatsapp/number", label: "WhatsApp number", Icon: Smartphone }] },
];
const CRUMB: Record<string, string> = { inbox: "Inbox", campaigns: "Campaigns", templates: "Templates", contacts: "Contacts", number: "WhatsApp number", new: "New" };

function Crumbs() {
  const parts = (usePathname() ?? "").replace(/^.*?\/whatsapp\/?/, "").split("/").filter(Boolean);
  const trail = parts.map((p, i) => ({ label: CRUMB[p] ?? (parts[0] === "campaigns" ? "Campaign" : parts[0] === "templates" ? "Template" : "Details"), href: `/whatsapp/${parts.slice(0, i + 1).join("/")}` }));
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[15px]">
      <a href="/whatsapp/inbox" className="text-stone-500 hover:text-stone-900">
        WhatsApp
      </a>
      {trail.map((t, i) => (
        <span key={t.href} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden />
          {i === trail.length - 1 ? (
            <span className="truncate font-medium text-stone-900">{t.label}</span>
          ) : (
            <a href={t.href} className="truncate text-stone-500 hover:text-stone-900">
              {t.label}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}

function Nav({ p, rail, onCollapse }: { p: ShellProps; rail: boolean; onCollapse?: (v: boolean) => void }) {
  const path = usePathname() ?? "";
  const { unreadChats } = usePulse();
  const link = (it: Item, external = false) => {
    const on = !external && (path === it.href || path.startsWith(`${it.href}/`));
    const n = it.badge === "unread" ? unreadChats : 0;
    return (
      <a
        key={it.href}
        href={it.href}
        title={rail ? it.label : undefined}
        aria-label={rail ? it.label : undefined}
        aria-current={on ? "page" : undefined}
        className={cx("relative flex items-center gap-3 rounded-xl text-[15.5px] transition", rail ? "justify-center p-2.5" : "px-3 py-2.5", on ? "bg-emerald-50 font-medium text-emerald-900 ring-1 ring-emerald-200" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")}
      >
        <it.Icon className={cx("h-[19px] w-[19px] shrink-0", on ? "text-emerald-700" : "text-stone-400")} aria-hidden />
        {!rail && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
        {n > 0 &&
          (rail ? (
            <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>
          ) : (
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-emerald-100 px-1.5 text-[12.5px] font-semibold text-emerald-800" aria-label={`${n} unread`}>
              {n > 99 ? "99+" : n}
            </span>
          ))}
      </a>
    );
  };
  const workspaceItems: Item[] = [
    { href: p.links.hub, label: "All channels", Icon: LayoutGrid },
    { href: p.links.settings, label: "Workspace settings", Icon: Settings },
    ...(p.links.billing ? [{ href: p.links.billing, label: "Billing", Icon: CreditCard }] : []),
  ];
  const heading = (t: string) => (rail ? <span className="mx-auto my-1 block h-px w-6 bg-stone-200" /> : <p className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-stone-400">{t}</p>);

  return (
    <div className={cx("flex h-full flex-col", rail ? "items-stretch px-2.5 py-4" : "px-3.5 py-4")}>
      <a href={p.links.hub} className={cx("flex items-center gap-3", rail ? "justify-center" : "px-1.5")} title="Invytra: all channels">
        <span className="relative">
          <LogoMark size={rail ? 36 : 40} />
          <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-white">
            <ChannelLogo id="whatsapp" size="xs" />
          </span>
        </span>
        {!rail && (
          <span className="min-w-0">
            <span className="block text-[19px] font-semibold leading-tight tracking-tight text-stone-900">Invytra</span>
            <span className="block truncate text-[13.5px] text-stone-500">WhatsApp · {p.workspace}</span>
          </span>
        )}
      </a>
      <nav aria-label="WhatsApp" className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto">
        {SECTIONS.map((s) => (
          <div key={s.title} className="flex flex-col gap-1 pb-3">
            {heading(s.title)}
            {s.items.map((it) => link(it))}
          </div>
        ))}
        <div className="flex flex-col gap-1 pb-3">
          {heading("Workspace")}
          {workspaceItems.map((it) => link(it, true))}
        </div>
      </nav>
      <div className="mt-2 space-y-2 border-t border-stone-100 pt-3">
        {onCollapse && (
          <button type="button" onClick={() => onCollapse(!rail)} className={cx("flex w-full items-center gap-3 rounded-xl text-[15px] text-stone-500 hover:bg-stone-100 hover:text-stone-900", rail ? "justify-center p-2.5" : "px-3 py-2")} aria-label={rail ? "Expand sidebar" : "Collapse sidebar"} title={rail ? "Expand sidebar" : undefined}>
            {rail ? <PanelLeftOpen className="h-[19px] w-[19px]" aria-hidden /> : <PanelLeftClose className="h-[19px] w-[19px]" aria-hidden />}
            {!rail && "Collapse"}
          </button>
        )}
        <div className={cx("flex items-center gap-2.5 rounded-2xl ring-1 ring-stone-200", rail ? "flex-col p-2" : "px-3 py-2.5")}>
          <span title={rail ? p.user.name : undefined}>
            <Avatar name={p.user.name} />
          </span>
          {!rail && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-stone-900">{p.user.name}</span>
              <span className="block text-[13px] text-stone-500">{p.user.role === "OWNER" ? "Owner" : "Member"}</span>
            </span>
          )}
          <form action={logout}>
            <button className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800" title="Sign out" aria-label="Sign out">
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Frame(p: ShellProps) {
  const path = usePathname() ?? "";
  const [rail, setRail] = useState(p.collapsed);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    setDrawer(false);
  }, [path]);
  const collapse = (v: boolean) => {
    setRail(v);
    document.cookie = `${SIDEBAR_COOKIE}=${v ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  // The inbox fills the screen (its list and chat scroll on their own); other pages scroll here.
  const fill = /\/inbox\/?$/.test(path);

  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf9f5]">
      <aside className={cx("hidden h-full shrink-0 border-r border-stone-200/80 bg-white transition-[width] duration-200 lg:block", rail ? "w-[80px]" : "w-[272px]")}>
        <Nav p={p} rail={rail} onCollapse={collapse} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-stone-900/30" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-[290px] max-w-[85vw] bg-white shadow-xl">
            <button onClick={() => setDrawer(false)} className="absolute right-3 top-4 z-10 rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close menu">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <Nav p={p} rail={false} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-stone-200/80 bg-white px-4 sm:px-6">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="lg:hidden">
            <LogoMark size={30} />
          </span>
          <div className="min-w-0 flex-1">
            <Crumbs />
          </div>
          <span className="hidden sm:block">
            <CreditsChip left={p.credits.left} href={p.credits.href} compact />
          </span>
          <Bell />
        </header>
        {p.banner}
        <main className={cx("min-h-0 flex-1", fill ? "overflow-hidden p-3 sm:p-4" : "overflow-y-auto px-4 py-6 sm:px-8 sm:py-8")}>{p.children}</main>
      </div>
    </div>
  );
}

/** The WhatsApp channel's frame: sidebar with the Invytra logo, breadcrumb, bell, the page across the whole width. */
export function WhatsappShell(p: ShellProps) {
  return (
    <PulseProvider>
      <Frame {...p} />
    </PulseProvider>
  );
}
