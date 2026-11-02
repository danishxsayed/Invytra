"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../ui";
import { Reveal } from "../motion";
import { ChannelTile, Cta, Eyebrow, h2 } from "./bits";

export interface ChannelPanel {
  id: "linkedin" | "email" | "whatsapp";
  name: string;
  title: string;
  body: string;
  points: string[];
  image: ReactNode;
  /** Card tint. */
  tint: string;
}

/**
 * The channels as cards that stack on top of each other while you scroll, with a pill bar
 * at the bottom that shows (and jumps to) the one you're on.
 */
export function ChannelStack({ panels, comingSoon }: { panels: ChannelPanel[]; comingSoon: string[] }) {
  const [active, setActive] = useState(panels[0]!.id as string);
  const [barShown, setBarShown] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id.replace("ch-", ""))), { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("[data-channel-panel]").forEach((el) => seen.observe(el));
    const bar = new IntersectionObserver(([e]) => setBarShown(!!e?.isIntersecting), { rootMargin: "-30% 0px -30% 0px" });
    if (wrap.current) bar.observe(wrap.current);
    return () => (seen.disconnect(), bar.disconnect());
  }, []);

  const short: Record<string, string> = { linkedin: "LinkedIn", email: "Email", whatsapp: "WhatsApp" };
  const tabs = [...panels.map((p) => ({ id: p.id as string, label: short[p.id] ?? p.name })), { id: "more", label: "More soon" }];
  return (
    <section id="channels" className="relative scroll-mt-16 pb-28 pt-6">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal className="max-w-[720px]">
          <Eyebrow>Channels</Eyebrow>
          <h2 className={`${h2} mt-4 text-stone-900`}>Meet people where they actually reply.</h2>
          <p className="mt-5 max-w-[560px] text-[19px] leading-relaxed text-stone-600">Use one channel or all three in a single sequence. Invytra moves each person to the next step on their own clock.</p>
        </Reveal>
      </div>

      <div ref={wrap} className="mx-auto mt-14 max-w-[1180px] space-y-8 px-5">
        {panels.map((p, i) => (
          <article
            key={p.id}
            id={`ch-${p.id}`}
            data-channel-panel
            className={cx("grid scroll-mt-24 overflow-hidden lg:sticky lg:min-h-[560px]rounded-[32px] border border-stone-900/[0.07] shadow-[0_-20px_60px_-30px_rgba(28,25,23,.25)] lg:grid-cols-[1fr_1.15fr]", p.tint)}
            style={{ top: 88 + i * 18 }}
          >
            <div className="flex flex-col justify-center p-8 sm:p-12">
              <div className="flex items-center gap-3">
                <ChannelTile id={p.id} size={44} />
                <span className="text-[17px] font-semibold text-stone-900">{p.name}</span>
              </div>
              <h3 className="mt-6 font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.025em] text-stone-900 sm:text-[40px]">{p.title}</h3>
              <p className="mt-4 text-[18px] leading-relaxed text-stone-600">{p.body}</p>
              <ul className="mt-6 space-y-3">
                {p.points.map((t) => (
                  <li key={t} className="flex gap-3 text-[16.5px] text-stone-800">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900">
                      <Check className="h-3 w-3 text-brand-400" strokeWidth={3} aria-hidden />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative flex items-center p-4 pt-0 sm:p-8 lg:pl-0">
              <div className="w-full overflow-hidden rounded-[22px] shadow-[0_30px_70px_-30px_rgba(28,25,23,.4)] ring-1 ring-stone-900/[0.06]">{p.image}</div>
            </div>
          </article>
        ))}
        <article id="ch-more" data-channel-panel className="flex min-h-[340px] lg:sticky flex-col items-center justify-center overflow-hidden rounded-[32px] bg-stone-900 p-10 text-center text-white" style={{ top: 88 + panels.length * 18 }}>
          <Eyebrow dark>Coming next</Eyebrow>
          <h3 className="mt-4 max-w-[560px] font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">More channels are on the way.</h3>
          <p className="mt-4 max-w-[520px] text-[17px] leading-relaxed text-white/70">Your leads, sequences and inbox stay the same. New channels simply show up as new steps.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {comingSoon.map((c) => (
              <span key={c} className="rounded-full border border-white/15 px-4 py-2 text-[15px] text-white/85">
                {c}
              </span>
            ))}
          </div>
          <Cta href="/signup" variant="lime" className="mt-9">
            Start free trial
          </Cta>
        </article>
      </div>

      <nav
        aria-label="Channels"
        className={cx(
          "fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-0.5 sm:bottom-6 sm:gap-1 rounded-full border border-stone-900/10 bg-white/85 p-1.5 shadow-pop backdrop-blur transition duration-500",
          barShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
        )}
      >
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`#ch-${t.id}`}
            aria-current={active === t.id ? "true" : undefined}
            className={cx("whitespace-nowrap rounded-full px-3 py-2 text-[13.5px] font-medium sm:px-4 sm:text-[14px] transition-colors duration-300 sm:px-4", active === t.id ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")}
          >
            {t.label}
          </a>
        ))}
      </nav>
    </section>
  );
}
