import type { ChannelId } from "@invytra/shared";
import { Instagram } from "lucide-react";
import { BARE_LOGO, CHANNEL_IMG } from "./channel-images";
import { cx } from "./ui";

const SIZE = { md: "h-12 w-12 rounded-xl", sm: "h-8 w-8 rounded-lg", xs: "h-[18px] w-[18px] rounded-[5px]" } as const;

/** A channel's logo: the real one where we have it, Instagram's mark until it launches. */
export function ChannelLogo({ id, muted, size = "md" }: { id: ChannelId; muted?: boolean; size?: "xs" | "sm" | "md" }) {
  const src = CHANNEL_IMG[id];
  if (src) {
    const bare = BARE_LOGO.has(id);
    return (
      <span aria-hidden className={cx("flex shrink-0 items-center justify-center overflow-hidden", SIZE[size], bare && "bg-white ring-1 ring-stone-200", muted && "opacity-40 grayscale")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
        <img src={src} alt="" className={cx("object-contain", bare ? "h-[62%] w-[62%]" : "h-full w-full")} draggable={false} />
      </span>
    );
  }
  return (
    <span aria-hidden className={cx("flex shrink-0 items-center justify-center", SIZE[size], muted ? "bg-stone-200 text-stone-400" : "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white")}>
      <Instagram className={size === "md" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-2.5 w-2.5"} />
    </span>
  );
}
