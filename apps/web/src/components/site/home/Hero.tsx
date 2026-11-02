"use client";

import { Check, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Parallax, Reveal, useScroll } from "../motion";
import { ChannelTile, Cta } from "./bits";

const WORDS = ["Outreach", "that", "feels", "personal,", "on", "every", "channel."];

/** Opening screen: headline, then the product leaning back and settling flat as you scroll, with live-looking cards around it. */
export function Hero({ dashboard, trialDays }: { dashboard: ReactNode; trialDays: number }) {
  const stage = useScroll<HTMLDivElement>((p, el) => {
    // Tilted back at first; flat by the time it's in the middle of the screen.
    const t = Math.min(1, p / 0.42);
    el.style.transform = `perspective(1600px) rotateX(${(1 - t) * 16}deg) scale(${0.92 + t * 0.08})`;
  });
  return (
    <section className="relative overflow-hidden">
      <Glow />
      <div className="relative mx-auto max-w-[1180px] px-5 pb-10 pt-16 text-center sm:pt-24">
        <Reveal>
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-stone-900/10 bg-white/70 py-1.5 pl-1.5 pr-4 text-[13px] font-medium sm:text-[14px] text-stone-700 shadow-card backdrop-blur">
            <span className="flex gap-1">
              <ChannelTile id="linkedin" size={24} className="ring-2 ring-white" />
              <ChannelTile id="email" size={24} className="ring-2 ring-white" />
              <ChannelTile id="whatsapp" size={24} className="ring-2 ring-white" />
            </span>
            <span className="sm:hidden">LinkedIn · Email · WhatsApp</span>
            <span className="hidden sm:inline">LinkedIn, email and WhatsApp in one place</span>
          </p>
        </Reveal>
        <h1 className="mx-auto mt-7 max-w-[920px] font-display text-[48px] font-semibold leading-[0.98] tracking-[-0.04em] text-stone-900 sm:text-[72px] lg:text-[86px]">
          {WORDS.map((w, i) => (
            <Reveal key={i} as="span" delay={120 + i * 70} y={40} className="mr-[0.22em] inline-block last:mr-0">
              {w === "channel." ? <span className="relative whitespace-nowrap">channel.<Underline /></span> : w}
            </Reveal>
          ))}
        </h1>
        <Reveal delay={650}>
          <p className="mx-auto mt-7 max-w-[640px] text-[19px] leading-relaxed text-stone-600 sm:text-[21px]">
            Find the right people, reach them where they reply, and follow up automatically. Every answer lands in one inbox, so no conversation slips through.
          </p>
        </Reveal>
        <Reveal delay={780}>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Cta href="/signup">Start free trial</Cta>
            <Cta href="#channels" variant="light">
              See how it works
            </Cta>
          </div>
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[14.5px] text-stone-500">
            {[`${trialDays}-day free trial`, "No card needed", "Cancel any time"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-600" aria-hidden /> {t}
              </span>
            ))}
          </p>
        </Reveal>
      </div>

      <div className="relative mx-auto max-w-[1180px] px-5 pb-24">
        <Reveal delay={900} y={60}>
          <div ref={stage} className="relative origin-top" style={{ willChange: "transform" }}>
            <div className="overflow-hidden rounded-[22px] border border-stone-900/10 bg-white p-1.5 shadow-[0_40px_100px_-30px_rgba(28,25,23,.35)] sm:rounded-[28px] sm:p-2">
              <div className="overflow-hidden rounded-[16px] sm:rounded-[22px]">{dashboard}</div>
            </div>
          </div>
        </Reveal>
        <FloatingCards />
      </div>
    </section>
  );
}

function Underline() {
  return (
    <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-[0.22em] w-full">
      <path d="M3 14 C 80 4, 200 2, 297 10" fill="none" stroke="#C4FA13" strokeWidth="9" strokeLinecap="round" pathLength={1} className="[stroke-dasharray:1] [stroke-dashoffset:1] [animation:site-draw_1.1s_1.1s_cubic-bezier(.6,0,.2,1)_forwards]" />
    </svg>
  );
}

/** Soft lime light behind the hero, drifting slowly. */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/2 h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(196,250,19,.38),transparent)] blur-2xl" />
      <div className="site-float absolute left-[6%] top-[38%] h-[260px] w-[260px] rounded-full bg-[radial-gradient(closest-side,rgba(37,211,102,.16),transparent)] blur-2xl" />
      <div className="site-float absolute right-[4%] top-[30%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(closest-side,rgba(10,102,194,.12),transparent)] blur-2xl [animation-delay:-3s]" />
    </div>
  );
}

/** Cards that look like moments from a running campaign, floating around the product. */
function FloatingCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      <Parallax speed={0.18} className="absolute -left-6 top-[14%]">
        <Reveal delay={1200}>
          <div className="site-float w-[250px] rounded-2xl border border-stone-900/[0.06] bg-white/95 p-3.5 text-left shadow-pop backdrop-blur">
            <div className="flex items-center gap-2.5">
              <ChannelTile id="linkedin" size={30} />
              <div>
                <p className="text-[13.5px] font-semibold text-stone-900">Invite accepted</p>
                <p className="text-[12.5px] text-stone-500">Priya N. · Head of Growth</p>
              </div>
            </div>
            <p className="mt-2.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[12.5px] text-stone-600">First message goes out tomorrow, 10:20 her time</p>
          </div>
        </Reveal>
      </Parallax>
      <Parallax speed={0.3} className="absolute -right-8 top-[6%]">
        <Reveal delay={1350}>
          <div className="site-float w-[270px] rounded-2xl border border-stone-900/[0.06] bg-white/95 p-3.5 text-left shadow-pop [animation-delay:-2s]">
            <div className="flex items-center gap-2.5">
              <ChannelTile id="email" size={30} />
              <p className="text-[13.5px] font-semibold text-stone-900">New reply</p>
              <span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-[11.5px] font-semibold text-brand-800">Interested</span>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-stone-600">“Sounds good. Could we talk on Thursday afternoon?”</p>
            <p className="mt-1.5 text-[12px] text-stone-400">Daniel K. · Berlin</p>
          </div>
        </Reveal>
      </Parallax>
      <Parallax speed={0.24} className="absolute -right-4 bottom-[22%]">
        <Reveal delay={1500}>
          <div className="site-float w-[250px] rounded-2xl bg-[#E7FBE9] p-3 text-left shadow-pop [animation-delay:-4s]">
            <div className="flex items-center gap-2">
              <ChannelTile id="whatsapp" size={26} />
              <p className="text-[13px] font-semibold text-stone-900">WhatsApp</p>
            </div>
            <p className="ml-6 mt-2 rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[13px] text-stone-700 shadow-card">Thanks! Please share the brochure 🙌</p>
            <p className="mr-0 mt-1.5 ml-auto w-fit rounded-xl rounded-tr-sm bg-[#D3F8C9] px-3 py-2 text-[13px] text-stone-700">Sent it just now ✓✓</p>
          </div>
        </Reveal>
      </Parallax>
      <Parallax speed={0.12} className="absolute -left-10 bottom-[18%]">
        <Reveal delay={1650}>
          <div className="site-float w-[240px] rounded-2xl bg-stone-900 p-4 text-left text-white shadow-pop [animation-delay:-5s]">
            <p className="flex items-center gap-1.5 text-[12.5px] text-brand-300">
              <Sparkles className="h-3.5 w-3.5" /> Campaign · Q4 founders
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <ChannelTile id="linkedin" size={22} />
              <span className="h-px flex-1 bg-white/25" />
              <ChannelTile id="email" size={22} />
              <span className="h-px flex-1 bg-white/25" />
              <ChannelTile id="whatsapp" size={22} />
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full w-[64%] origin-left rounded-full bg-brand-400 [animation:site-grow_1.6s_1.9s_cubic-bezier(.2,.7,.2,1)_backwards]" />
            </div>
            <p className="mt-2 text-[12px] text-white/60">Step 3 of 5 · running in the cloud</p>
          </div>
        </Reveal>
      </Parallax>
    </div>
  );
}
