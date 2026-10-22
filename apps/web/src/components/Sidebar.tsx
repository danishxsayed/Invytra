"use client";

import {
  Activity,
  ChevronsUpDown,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
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
import { accountDot } from "./StatusBadge";
import { Avatar, cx } from "./ui";

interface Props {
  workspace: string;
  user: { name: string; email: string };
  accounts: { id: string; label: string; status: string }[];
}

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/campaigns", label: "Campaigns", icon: Rocket, soon: true },
  { href: "/app/leads", label: "Leads", icon: ListChecks, soon: true },
  { href: "/app/inbox", label: "Inbox", icon: Inbox },
  { href: "/app/activity", label: "Activity", icon: Activity },
  { href: "/app/accounts", label: "Accounts", icon: Users, soon: true },
  { href: "/app/settings", label: "Settings", icon: Settings, soon: true },
];

function Logo() {
  return (
    <Link href="/app" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-400 text-[15px] font-bold text-stone-900 shadow-glow">
        I
      </span>
      <span className="text-[17px] font-semibold tracking-tight text-stone-900">Invytra</span>
    </Link>
  );
}

function AccountSwitcher({ accounts }: { accounts: Props["accounts"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const current = accounts[0];
  if (!current) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-[13px] text-stone-500">
        No LinkedIn account yet
      </div>
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
          <span className="block truncate text-[13px] font-medium text-stone-900">{current.label}</span>
          <span className="block text-[12px] text-stone-500">{statusText(current.status)}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-stone-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 animate-fade-up rounded-xl border border-stone-200 bg-white p-1 shadow-pop">
          <p className="px-2.5 pb-1 pt-1.5 text-[12px] text-stone-400">LinkedIn accounts</p>
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-stone-50">
              <span className={cx("h-2 w-2 rounded-full", accountDot(a.status))} aria-hidden />
              <span className="flex-1 truncate">{a.label}</span>
              <span className="text-[12px] text-stone-400">{statusText(a.status)}</span>
            </div>
          ))}
          <div className="mt-1 border-t border-stone-100 px-2.5 py-2 text-[12px] text-stone-400">
            Connecting accounts from here arrives next.
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarBody({ workspace, user, accounts, onNavigate }: Props & { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-5 px-3 py-5">
      <div className="px-1.5">
        <Logo />
      </div>
      <div className="space-y-2">
        <AccountSwitcher accounts={accounts} />
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 text-[12px] font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Safe mode on
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, soon }) => {
          const active = href === "/app" ? path === "/app" : path.startsWith(href);
          if (soon) {
            return (
              <span key={href} aria-disabled className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-stone-400">
                <Icon className="h-4 w-4" aria-hidden />
                <span className="flex-1">{label}</span>
                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">Soon</span>
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
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] transition-colors",
                active ? "bg-brand-400 font-medium text-stone-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
              )}
            >
              <Icon className={cx("h-4 w-4", active ? "text-stone-900" : "text-stone-400")} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-xl px-1.5 py-1">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-stone-900">{user.name}</p>
          <p className="truncate text-[12px] text-stone-500">{workspace}</p>
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

export function Sidebar(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-stone-200/80 bg-white lg:block">
        <SidebarBody {...props} />
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
          <div className="absolute inset-y-0 left-0 w-[280px] animate-fade-up bg-white shadow-pop">
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
