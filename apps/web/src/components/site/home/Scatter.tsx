import type { ReactNode } from "react";
import { Parallax, Reveal } from "../motion";
import { h2 } from "./bits";

/**
 * A big statement in the middle, with pictures scattered around it that drift at
 * different speeds as you scroll (depth without a video).
 */
export function Scatter({ images }: { images: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode] }) {
  const [founder, whatsapp, inbox, team, linkedin] = images;
  const frame = "overflow-hidden rounded-[22px] shadow-[0_24px_60px_-24px_rgba(28,25,23,.35)] ring-1 ring-stone-900/[0.06]";
  return (
    <section className="relative overflow-hidden py-28 sm:py-40">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-[480px] -translate-y-1/2 bg-[radial-gradient(closest-side,rgba(196,250,19,.22),transparent)]" />
      {/* Pictures (desktop: around the text; mobile: a row under it) */}
      <div className="pointer-events-none absolute inset-0 mx-auto hidden max-w-[1320px] lg:block">
        <Parallax speed={0.35} className="absolute left-[3%] top-[8%] w-[210px] -rotate-3">
          <Reveal className={frame}>{founder}</Reveal>
        </Parallax>
        <Parallax speed={0.15} className="absolute left-[16%] bottom-[6%] w-[200px] rotate-2">
          <Reveal delay={120} className={frame}>{whatsapp}</Reveal>
        </Parallax>
        <Parallax speed={0.45} className="absolute right-[4%] top-[4%] w-[250px] rotate-2">
          <Reveal delay={200} className={frame}>{inbox}</Reveal>
        </Parallax>
        <Parallax speed={0.22} className="absolute right-[15%] bottom-[2%] w-[190px] -rotate-2">
          <Reveal delay={280} className={frame}>{team}</Reveal>
        </Parallax>
        <Parallax speed={0.6} className="absolute left-1/2 top-[-2%] w-[200px] -translate-x-[150%] rotate-6">
          <Reveal delay={360} className={frame}>{linkedin}</Reveal>
        </Parallax>
      </div>
      <div className="relative mx-auto max-w-[640px] px-5 text-center">
        <Reveal>
          <h2 className={`${h2} text-stone-900`}>
            All your outreach,
            <br />
            one calm workspace.
          </h2>
        </Reveal>
        <Reveal delay={150}>
          <p className="mx-auto mt-6 max-w-[520px] text-[19px] leading-relaxed text-stone-600">
            Stop jumping between tabs. Invytra brings your LinkedIn accounts, mailboxes and WhatsApp number together, with one list of leads and one inbox for every reply.
          </p>
        </Reveal>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:hidden">
        <div className={frame}>{founder}</div>
        <div className={frame}>{inbox}</div>
        <div className={`${frame} hidden sm:block`}>{team}</div>
      </div>
    </section>
  );
}
