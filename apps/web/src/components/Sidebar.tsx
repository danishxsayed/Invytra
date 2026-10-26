"use client";

import {
  Activity,
  ChevronsUpDown,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";
import { accountDot } from "./StatusBadge";
import { LogoMark } from "./LogoMark";
import { Avatar, cx } from "./ui";

interface Props {
  workspace: string;
  user: { name: string; email: string };
  accounts: { id: string; label: string; status: string; profileName: string | null }[];
  /** Replies waiting for an answer, shown as a badge on Inbox. */
  needsReply?: number;
  /** Desktop sidebar starts narrow (icons only); remembered in a cookie. */
  collapsed?: boolean;
}

const NAV: { href: string; label: string; icon: typeof Settings; soon?: boolean }[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/campaigns", label: "Campaigns", icon: Rocket },
  { href: "/app/leads", label: "Leads", icon: ListChecks },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/accounts", label: "Accounts", icon: Users },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <Link href="/app" className="flex items-center gap-2.5">
      <LogoMark size={34} />
      <span className="text-[20px] font-semibold tracking-tight text-stone-900">Invytra</span>
    </Link>
  );
}

function AccountSwitcher({ accounts, onNavigate }: { accounts: Props["accounts"]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // Show the account that most needs a look first.
  const rank = (st: string) => (st === "NEEDS_ATTENTION" ? 0 : st === "DISCONNECTED" ? 1 : st === "PAUSED" ? 2 : 3);
  const current = [...accounts].sort((a, b) => rank(a.status) - rank(b.status))[0];
  if (!current) {
    return (
      <Link
        href="/app/accounts?add=1"
        onClick={onNavigate}
        className="flex items-center gap-2 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-[15px] font-medium text-stone-600 hover:border-brand-500 hover:bg-brand-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> Connect LinkedIn
      </Link>
    );
  }
  const statusText = (s: string) => (s === "ACTIVE" ? "Connected" : s === "NEEDS_ATTENTION" ? "Needs attention" : s === "PAUSED" ? "Paused" : "Not connected");
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-left shadow-card hover:border-stone-300"
      >
        <span className="relative">
          <Avatar name={current.label} />
          <span className={cx("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", accountDot(current.status))} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-stone-900">{current.label}</span>
          <span className="block truncate text-[14px] text-stone-500">
            {statusText(current.status)}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-stone-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 animate-fade-up rounded-xl border border-stone-200 bg-white p-1 shadow-pop">
          <p className="px-2.5 pb-1 pt-1.5 text-[14px] text-stone-400">LinkedIn accounts</p>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={`/app/accounts/${a.id}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px] hover:bg-stone-50"
            >
              <span className={cx("h-2 w-2 shrink-0 rounded-full", accountDot(a.status))} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-stone-900">{a.label}</span>
                {a.profileName && <span className="block truncate text-[13px] text-stone-400">{a.profileName}</span>}
              </span>
              <span className="shrink-0 text-[14px] text-stone-400">{statusText(a.status)}</span>
            </Link>
          ))}
          <Link
            href="/app/accounts?add=1"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="mt-1 flex items-center gap-2 border-t border-stone-100 px-2.5 py-2.5 text-[15px] font-medium text-brand-800 hover:text-stone-900"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add account
          </Link>
        </div>
      )}
    </div>
  );
}

function SidebarBody({ workspace, user, accounts, needsReply, onNavigate, onCollapse }: Props & { onNavigate?: () => void; onCollapse?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-5 px-3 py-5">
      <div className="flex items-center justify-between px-1.5">
        <Logo />
        {onCollapse && (
          <button onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-800">
            <PanelLeftClose className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        <AccountSwitcher accounts={accounts} onNavigate={onNavigate} />
        <Link
          href="/app/accounts"
          onClick={onNavigate}
          title="Daily totals vary, new accounts warm up, actions run only in working hours, and anything unusual stops the account."
          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 text-[14px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Safe mode on
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, soon }) => {
          const active = href === "/app" ? path === "/app" : path.startsWith(href);
          if (soon) {
            return (
              <span key={href} aria-disabled className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[16px] text-stone-400">
                <Icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{label}</span>
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[13px] font-medium text-stone-500">Soon</span>
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[16px] transition-colors",
                active ? "bg-brand-400 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
              )}
            >
              <Icon className={cx("h-4 w-4", active ? "text-stone-900" : "text-stone-400")} aria-hidden />
              <span className="flex-1">{label}</span>
              {href === "/app/inbox" && !!needsReply && (
                <span
                  className={cx("min-w-[22px] rounded-full px-1.5 text-center text-[13px] font-semibold tabular-nums", active ? "bg-stone-900 text-white" : "bg-brand-400 text-stone-900")}
                  aria-label={`${needsReply} need a reply`}
                >
                  {needsReply > 99 ? "99+" : needsReply}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-xl px-1.5 py-1">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-stone-900">{user.name}</p>
          <p className="truncate text-[14px] text-stone-500">{workspace}</p>
        </div>
        <form action={logout}>
          <button title="Log out" aria-label="Log out" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/** The narrow sidebar: icons only, names on hover. */
function SidebarRail({ accounts, user, needsReply, onExpand }: Props & { onExpand: () => void }) {
  const path = usePathname();
  const rank = (st: string) => (st === "NEEDS_ATTENTION" ? 0 : st === "DISCONNECTED" ? 1 : st === "PAUSED" ? 2 : 3);
  const current = [...accounts].sort((a, b) => rank(a.status) - rank(b.status))[0];
  return (
    <div className="flex h-full flex-col items-center gap-4 py-5">
      <Link href="/app" title="Invytra" aria-label="Invytra home">
        <LogoMark size={34} />
      </Link>
      <button onClick={onExpand} title="Expand sidebar" aria-label="Expand sidebar" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-800">
        <PanelLeftOpen className="h-5 w-5" />
      </button>
      {current ? (
        <Link href={`/app/accounts/${current.id}`} title={current.label} className="relative">
          <Avatar name={current.label} />
          <span className={cx("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", accountDot(current.status))} />
        </Link>
      ) : (
        <Link href="/app/accounts?add=1" title="Connect LinkedIn" className="rounded-lg border border-dashed border-stone-300 p-2 text-stone-500 hover:border-brand-500">
          <Plus className="h-4 w-4" />
        </Link>
      )}
      <Link href="/app/accounts" title="Safe mode on" className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100">
        <ShieldCheck className="h-4 w-4" aria-label="Safe mode on" />
      </Link>
      <nav aria-label="Main" className="flex flex-col items-center gap-1">
        {NAV.filter((n) => !n.soon).map(({ href, label, icon: Icon }) => {
          const active = href === "/app" ? path === "/app" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cx("relative rounded-lg p-2.5 transition-colors", active ? "bg-brand-400 text-stone-900" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900")}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {href === "/app/inbox" && !!needsReply && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-stone-900 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                  {needsReply > 99 ? "99+" : needsReply}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2">
        <span title={user.name}>
          <Avatar name={user.name} />
        </span>
        <form action={logout}>
          <button title="Log out" aria-label="Log out" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar(props: Props) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(!!props.collapsed);
  const toggle = (v: boolean) => {
    setCollapsed(v);
    document.cookie = `${SIDEBAR_COOKIE}=${v ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <>
      <aside
        className={cx(
          "sticky top-0 hidden h-screen shrink-0 border-r border-stone-200/80 bg-white transition-[width] duration-200 lg:block",
          collapsed ? "w-[76px]" : "w-[284px]",
        )}
      >
        {collapsed ? <SidebarRail {...props} onExpand={() => toggle(false)} /> : <SidebarBody {...props} onCollapse={() => toggle(true)} />}
      </aside>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-stone-600 hover:bg-stone-100">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-stone-900/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[312px] animate-fade-up bg-white shadow-pop">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-2 text-stone-500 hover:bg-stone-100">
              <X className="h-5 w-5" />
            </button>
            <SidebarBody {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
