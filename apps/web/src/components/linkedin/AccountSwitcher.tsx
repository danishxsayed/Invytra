"use client";

import { ChevronsUpDown, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { accountDot } from "../StatusBadge";
import { Avatar, cx } from "../ui";

export type SidebarAccount = { id: string; label: string; status: string; profileName: string | null; photo: string | null };
type Account = SidebarAccount;

const STATUS: Record<string, { text: string; pill: string }> = {
  ACTIVE: { text: "Connected", pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  NEEDS_ATTENTION: { text: "Needs attention", pill: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  PAUSED: { text: "Paused", pill: "bg-stone-100 text-stone-600 ring-stone-500/15" },
  DISCONNECTED: { text: "Not connected", pill: "bg-stone-100 text-stone-600 ring-stone-500/15" },
};
const statusOf = (s: string) => STATUS[s] ?? STATUS.DISCONNECTED!;
// Accounts that need a look come first.
const rank = (st: string) => (st === "NEEDS_ATTENTION" ? 0 : st === "DISCONNECTED" ? 1 : st === "PAUSED" ? 2 : 3);

/** Photo (or initials) with a status dot. */
function AccountFace({ a, size = "md" }: { a: Account; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="relative shrink-0">
      <Avatar name={a.profileName ?? a.label} src={a.photo} size={size} />
      <span className={cx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", accountDot(a.status))} aria-hidden />
    </span>
  );
}

/** The LinkedIn account picker at the top of the LinkedIn menu (with "Safe mode on" under it). */
export function AccountSwitcher({ accounts, onNavigate }: { accounts: SidebarAccount[]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const sorted = [...accounts].sort((a, b) => rank(a.status) - rank(b.status) || a.label.localeCompare(b.label));
  if (sorted.length === 0) {
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
  const connected = accounts.filter((a) => a.status === "ACTIVE").length;
  const needs = accounts.length - connected;
  const single = sorted.length === 1 ? sorted[0]! : null;
  const go = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(
          "flex w-full items-center gap-2.5 rounded-xl border bg-white px-2.5 py-1.5 text-left shadow-card transition hover:border-stone-300",
          open ? "border-stone-300 ring-4 ring-stone-100" : "border-stone-200",
        )}
      >
        {single ? (
          <AccountFace a={single} size="sm" />
        ) : (
          <span className="flex shrink-0 -space-x-2">
            {sorted
              .slice()
              .sort((a, b) => rank(b.status) - rank(a.status))
              .slice(0, 3)
              .map((a) => (
                <span key={a.id} className="rounded-full ring-2 ring-white">
                  <Avatar name={a.profileName ?? a.label} src={a.photo} size="sm" />
                </span>
              ))}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-5 text-stone-900">{single ? single.label : `${accounts.length} accounts`}</span>
          <span className={cx("flex items-center gap-1.5 truncate text-[12px] leading-4", needs ? "text-amber-700" : "text-emerald-700")}>
            {single ? statusOf(single.status).text : needs ? `${connected} of ${accounts.length} connected` : "All connected"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-stone-100 px-3.5 py-2.5">
            <p className="text-[14px] font-semibold text-stone-900">LinkedIn accounts</p>
            <Link href="/app/accounts" onClick={go} className="text-[13px] font-medium text-brand-800 hover:text-stone-900">
              Manage
            </Link>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto p-1">
            {sorted.map((a) => {
              const st = statusOf(a.status);
              const needsConnect = a.status === "DISCONNECTED" || a.status === "NEEDS_ATTENTION";
              return (
                <li key={a.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                  <Link href={`/app/accounts/${a.id}`} onClick={go} className="flex min-w-0 flex-1 items-center gap-3">
                    <AccountFace a={a} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium leading-5 text-stone-900">{a.label}</span>
                      <span className="block truncate text-[12px] leading-4 text-stone-500">{a.profileName ?? "Not connected yet"}</span>
                    </span>
                  </Link>
                  {needsConnect ? (
                    <Link
                      href={`/app/accounts/${a.id}?connect=${a.id}`}
                      onClick={go}
                      className="shrink-0 rounded-md bg-stone-900 px-2 py-0.5 text-[12px] font-semibold leading-5 text-white hover:bg-stone-700"
                    >
                      {a.status === "NEEDS_ATTENTION" ? "Check" : "Connect"}
                    </Link>
                  ) : (
                    <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1", st.pill)}>{st.text}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <Link
            href="/app/accounts?add=1"
            onClick={go}
            className="flex items-center gap-2 border-t border-stone-100 px-3.5 py-2.5 text-[14px] font-medium text-brand-800 hover:bg-stone-50 hover:text-stone-900"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add account
          </Link>
        </div>
      )}
    </div>
  );
}


/** The switcher plus the "Safe mode on" link: the LinkedIn menu's extra block. */
export function LinkedinAccounts({ accounts }: { accounts: SidebarAccount[] }) {
  return (
    <div className="space-y-2">
      <AccountSwitcher accounts={accounts} />
      <Link
        href="/app/accounts"
        title="Daily totals vary, new accounts warm up, actions run only in working hours, and anything unusual stops the account."
        className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 text-[14px] font-medium text-emerald-700 hover:bg-emerald-100"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Safe mode on
      </Link>
    </div>
  );
}
