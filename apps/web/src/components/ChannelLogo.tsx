import type { ChannelId } from "@invytra/shared";
import { Instagram, Linkedin, Mail, MessageCircle } from "lucide-react";
import { cx } from "./ui";

const LOGO: Record<ChannelId, { icon: typeof Mail; cls: string }> = {
  linkedin: { icon: Linkedin, cls: "bg-[#0a66c2] text-white" },
  whatsapp: { icon: MessageCircle, cls: "bg-[#25d366] text-white" },
  email: { icon: Mail, cls: "bg-amber-500 text-white" },
  instagram: { icon: Instagram, cls: "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white" },
};

/** A channel's mark on its hub card. */
export function ChannelLogo({ id, muted, size = "md" }: { id: ChannelId; muted?: boolean; size?: "xs" | "sm" | "md" }) {
  const l = LOGO[id];
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-xl",
        size === "md" ? "h-12 w-12" : size === "sm" ? "h-8 w-8 rounded-lg" : "h-[18px] w-[18px] rounded-[5px]",
        muted ? "bg-stone-200 text-stone-400" : l.cls,
      )}
    >
      <l.icon className={size === "md" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-2.5 w-2.5"} />
    </span>
  );
}
