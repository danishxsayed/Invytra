"use client";

import { Inbox, Plug, Workflow } from "lucide-react";
import { Reveal, useScroll } from "../motion";
import { ChannelTile, Eyebrow, h2 } from "./bits";

const STEPS = [
  {
    icon: Plug,
    title: "Connect your channels",
    body: "Log in to LinkedIn in a secure window, add your mailboxes and your WhatsApp number. It takes a few minutes.",
    visual: (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(["linkedin", "email", "whatsapp"] as const).map((c, i) => (
          <span key={c} className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-1 pl-1 pr-3 text-[13px] font-medium text-stone-700 shadow-card">
            <ChannelTile id={c} size={22} /> {["Connected", "3 inboxes", "Verified"][i]}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: Workflow,
    title: "Build one sequence",
    body: "Visit on LinkedIn, then an email, then a WhatsApp follow-up. Names and companies fill in for each person.",
    visual: (
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] font-medium text-stone-700">
        {["Visit", "Invite", "Email", "WhatsApp"].map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="rounded-lg bg-white px-2.5 py-1 shadow-card">{s}</span>
            {i < 3 && <span className="text-stone-400">→</span>}
          </span>
        ))}
      </div>
    ),
  },
  {
    icon: Inbox,
    title: "Reply from one inbox",
    body: "Every answer, from every channel, in one place. Someone replies and their follow-ups stop on their own.",
    visual: (
      <div className="w-full max-w-[260px] space-y-1.5">
        {[
          ["linkedin", "Sara M.", "Happy to chat next week"],
          ["whatsapp", "Omar A.", "Yes, send the details"],
        ].map(([c, n, t]) => (
          <div key={n} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-left shadow-card">
            <ChannelTile id={c as "linkedin"} size={22} />
            <span className="truncate text-[13px] text-stone-700">
              <b className="font-semibold text-stone-900">{n}</b> {t}
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

/** Three steps joined by a line that fills in as you scroll. */
export function Steps() {
  const ref = useScroll<HTMLDivElement>((p, el) => el.style.setProperty("--fill", String(Math.min(1, Math.max(0, (p - 0.25) / 0.35)))));
  return (
    <section id="how" className="scroll-mt-16 border-y border-stone-900/[0.07] bg-white/60 py-28">
      <div className="mx-auto max-w-[1180px] px-5">
        <Reveal className="mx-auto max-w-[700px] text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className={`${h2} mt-4 text-stone-900`}>Live in minutes, not weeks.</h2>
        </Reveal>
        <div ref={ref} className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6" style={{ ["--fill" as string]: 0 }}>
          <div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-[3px] overflow-hidden rounded-full bg-stone-200 md:block">
            <div className="h-full origin-left rounded-full bg-brand-400" style={{ transform: "scaleX(var(--fill))" }} />
          </div>
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 140} className="relative text-center">
              <span className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-brand-400 shadow-pop">
                <s.icon className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-stone-400">Step {i + 1}</p>
              <h3 className="mt-1.5 font-display text-[26px] font-semibold tracking-[-0.02em] text-stone-900">{s.title}</h3>
              <p className="mx-auto mt-3 max-w-[330px] text-[16.5px] leading-relaxed text-stone-600">{s.body}</p>
              <div className="mx-auto mt-6 flex min-h-[92px] max-w-[340px] items-center justify-center rounded-2xl bg-canvas p-4">{s.visual}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
