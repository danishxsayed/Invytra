"use client";

import { useState } from "react";
import { Avatar } from "./ui";

/** A lead's LinkedIn photo; their initials when there's none or it won't load (LinkedIn's links expire). */
export function PersonPhoto({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <Avatar name={name} size={size} />;
  const sz = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- LinkedIn's own photo link, shown as is
    <img src={src} alt="" aria-hidden referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className={`${sz} shrink-0 rounded-full bg-stone-100 object-cover ring-1 ring-black/5`} />
  );
}
