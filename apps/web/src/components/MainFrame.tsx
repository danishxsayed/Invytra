"use client";

import { usePathname } from "next/navigation";

/**
 * The page area of the workspace: a centred column for most pages; the inbox uses the whole
 * width and height of the screen (the list and the conversation scroll on their own).
 */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const wide = /\/inbox\/?$/.test(usePathname() ?? "");
  return (
    <div className={wide ? "px-4 py-4 sm:px-6 lg:h-dvh lg:py-5" : "mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-10 print:max-w-none print:p-0"}>{children}</div>
  );
}
