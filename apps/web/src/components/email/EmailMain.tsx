"use client";

import { usePathname } from "next/navigation";

/** The Email pages' content area: centred, except the inbox, which uses the whole screen. */
export function EmailMain({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const wide = path.endsWith("/inbox");
  return <main className={wide ? "px-4 py-4 sm:px-6" : "mx-auto max-w-6xl px-4 py-8 sm:px-6"}>{children}</main>;
}
