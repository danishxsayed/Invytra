import { AtSign, Instagram, Linkedin, Mail, MessageCircle, MessageSquareText, Send, Smartphone } from "lucide-react";

const ITEMS = [
  { name: "LinkedIn", icon: Linkedin, live: true },
  { name: "Email", icon: Mail, live: true },
  { name: "WhatsApp", icon: MessageCircle, live: true },
  { name: "Instagram", icon: Instagram, live: false },
  { name: "SMS", icon: Smartphone, live: false },
  { name: "Telegram", icon: Send, live: false },
  { name: "X", icon: AtSign, live: false },
  { name: "Messenger", icon: MessageSquareText, live: false },
];

/** A slow ribbon of channels: the ones live today, then the ones on the way. */
export function ChannelMarquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <section aria-label="Channels" className="border-y border-stone-900/[0.07] bg-white/60 py-7">
      <p className="mb-5 text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-stone-500">One platform. Every channel your buyers use.</p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="site-marquee flex w-max gap-4">
          {row.map((c, i) => (
            <li key={i} aria-hidden={i >= ITEMS.length} className="flex items-center gap-2.5 rounded-full border border-stone-900/[0.08] bg-white px-5 py-2.5 text-[16px] font-medium text-stone-800 shadow-card">
              <c.icon className="h-[18px] w-[18px] text-stone-700" aria-hidden />
              {c.name}
              <span className={c.live ? "rounded-full bg-brand-400 px-2 py-0.5 text-[11.5px] font-semibold text-stone-900" : "rounded-full bg-stone-100 px-2 py-0.5 text-[11.5px] font-semibold text-stone-500"}>{c.live ? "Live" : "Soon"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
