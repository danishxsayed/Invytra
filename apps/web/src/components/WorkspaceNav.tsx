"use client";

import { CreditCard, LayoutGrid, LogOut, Menu, Settings, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { ChannelLogo } from "./ChannelLogo";
import { CreditsChip } from "./credits/CreditsChip";
import { LogoMark } from "./LogoMark";
import { Avatar, cx } from "./ui";

export interface WorkspaceNavProps {
  workspace: string;
  user: { name: string; email: string };
  overview: string;
  channels: { id: string; label: string; href: string | null; note?: string }[];
  settings: string;
  /** Only for the workspace owner. */
  billing: string | null;
  credits: { left: number; href: string | null };
}

/**
 * The workspace's own navigation (never inside a channel): overview, every channel, and the
 * workspace-wide pages (settings, billing). A sidebar on wide screens, a drawer on phones.
 */
export function WorkspaceNav(p: WorkspaceNavProps) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // On the hub's own domain pages are /settings; on one address they're /workspace/settings.
  const at = (href: string) => {
    const page = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/workspace(?=\/|$)/, "") || "/";
    const here = path.replace(/^\/workspace(?=\/|$)/, "") || "/";
    return page === "/" ? here === "/" : here === page || here.startsWith(`${page}/`);
  };
  const item = (href: string, label: string, icon: React.ReactNode) => (
    <a
      href={href}
      aria-current={at(href) ? "page" : undefined}
      className={cx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
        at(href) ? "bg-[#d8f35a] text-stone-950" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </a>
  );

  const body = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center gap-2.5 px-1">
        <LogoMark size={32} />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-tight tracking-tight text-stone-900">Invytra</p>
          <p className="truncate text-[13px] text-stone-500">{p.workspace}</p>
        </div>
      </div>
      <nav aria-label="Workspace" className="flex flex-col gap-1">
        {item(p.overview, "Workspace overview", <LayoutGrid className="h-[18px] w-[18px]" aria-hidden />)}
        <p className="mt-3 px-3 text-[12px] font-semibold uppercase tracking-wider text-stone-400">Channels</p>
        {p.channels.map((c) =>
          c.href ? (
            <a key={c.id} href={c.href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium text-stone-700 transition hover:bg-stone-100 hover:text-stone-900">
              <ChannelLogo id={c.id as never} size="sm" />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
            </a>
          ) : (
            <span key={c.id} className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium text-stone-400" aria-disabled>
              <ChannelLogo id={c.id as never} size="sm" muted />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.note && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">{c.note}</span>}
            </span>
          ),
        )}
        <p className="mt-3 px-3 text-[12px] font-semibold uppercase tracking-wider text-stone-400">Workspace</p>
        {item(p.settings, "Workspace settings", <Settings className="h-[18px] w-[18px]" aria-hidden />)}
        {p.billing && item(p.billing, "Billing", <CreditCard className="h-[18px] w-[18px]" aria-hidden />)}
      </nav>
      <div className="mt-auto space-y-3">
        <CreditsChip left={p.credits.left} href={p.credits.href ?? undefined} className="w-full justify-center py-2" />
        <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
          <Avatar name={p.user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-stone-900">{p.user.name}</p>
            <p className="truncate text-[12px] text-stone-500">{p.user.email}</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-800" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 border-r border-stone-200/70 bg-white/70 lg:block print:!hidden">{body}</aside>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200/70 bg-white/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-stone-600 hover:bg-stone-100" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <LogoMark size={28} />
        <span className="truncate text-[16px] font-semibold text-stone-900">{p.workspace}</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Menu">
          <button className="absolute inset-0 bg-stone-900/30" onClick={() => setOpen(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] overflow-y-auto bg-[#faf9f5] shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {body}
          </div>
        </div>
      )}
    </>
  );
}
