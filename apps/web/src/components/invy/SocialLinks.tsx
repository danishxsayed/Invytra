import type { SocialLink, SocialNetwork } from "@invytra/shared";
import { Facebook, Instagram, Twitter, Youtube } from "lucide-react";
import { CHANNEL_IMG } from "../channel-images";

const LOOK: Record<SocialNetwork, { label: string; Icon?: typeof Instagram; img?: string; cls: string }> = {
  instagram: { label: "Instagram", Icon: Instagram, cls: "text-pink-600" },
  facebook: { label: "Facebook", Icon: Facebook, cls: "text-blue-600" },
  linkedin: { label: "LinkedIn", img: CHANNEL_IMG.linkedin, cls: "" },
  x: { label: "X", Icon: Twitter, cls: "text-stone-800" },
  youtube: { label: "YouTube", Icon: Youtube, cls: "text-red-600" },
  whatsapp: { label: "WhatsApp", img: CHANNEL_IMG.whatsapp, cls: "" },
};

/** The business's social profiles as small labelled links (open in a new tab). */
export function SocialLinks({ links, className }: { links: SocialLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className ?? ""}`} aria-label="Social profiles">
      {links.map((s) => {
        const l = LOOK[s.network];
        if (!l) return null;
        return (
          <li key={s.network}>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[12px] font-medium text-stone-700 hover:border-stone-400"
            >
              {l.img ? (
                // eslint-disable-next-line @next/next/no-img-element -- small static logo
                <img src={l.img} alt="" className="h-3.5 w-3.5 rounded-[3px] object-contain" />
              ) : (
                l.Icon && <l.Icon className={`h-3.5 w-3.5 ${l.cls}`} aria-hidden />
              )}
              {l.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
