"use client";

import { usePathname } from "next/navigation";

/** Page frame: centred with margins, except full-screen pages (the inbox) which fill the space. */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/app/inbox")) return <div className="h-[calc(100dvh-57px)] lg:h-screen">{children}</div>;
  return <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</div>;
}
