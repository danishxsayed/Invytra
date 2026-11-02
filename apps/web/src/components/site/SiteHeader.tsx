"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "../LogoMark";
import { cx } from "../ui";

const NAV = [
  { href: "/#channels", label: "Channels" },
  { href: "/#how", label: "How it works" },
  { href: "/#safety", label: "Safety" },
  { href: "/pricing", label: "Pricing" },
  { href: "/compare", label: "Compare" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Invytra home">
      <LogoMark size={34} />
      <span className="font-display text-[21px] font-semibold tracking-tight text-stone-900">Invytra</span>
    </Link>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-stone-900/[0.06] bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-6 px-5">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "rounded-lg px-3 py-2 text-[15px] transition-colors",
                path === n.href ? "font-medium text-stone-900" : "text-stone-600 hover:text-stone-900",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-lg px-3 py-2 text-[15px] font-medium text-stone-700 hover:text-stone-900">
            Log in
          </Link>
          <Link href="/signup" className="rounded-full bg-stone-900 px-5 py-2.5 text-[15px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-stone-800">
            Start free trial
          </Link>
        </div>
        <button className="rounded-lg p-2 text-stone-700 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="border-t border-stone-900/[0.06] px-5 pb-5 pt-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-stone-200/70 py-3 text-[17px] text-stone-800">
              {n.label}
            </Link>
          ))}
          <div className="mt-4 flex gap-2">
            <Link href="/login" className="flex-1 rounded-lg border border-stone-300 py-2.5 text-center text-[16px] font-medium">
              Log in
            </Link>
            <Link href="/signup" className="flex-1 rounded-lg bg-stone-900 py-2.5 text-center text-[16px] font-semibold text-white">
              Start free trial
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
