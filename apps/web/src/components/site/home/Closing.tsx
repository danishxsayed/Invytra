import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Parallax, Reveal } from "../motion";
import { Cta } from "./bits";

/** Last call to action: lime panel, the channel objects floating out of it. */
export function Closing({ image, trialDays }: { image: ReactNode; trialDays: number }) {
  return (
    <section className="mx-auto max-w-[1180px] px-5 pb-28">
      <Reveal y={50}>
        <div className="relative grid items-center gap-8 overflow-hidden rounded-[36px] bg-brand-400 px-7 py-12 sm:px-14 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-white/30 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] text-stone-900 sm:text-[60px]">Start conversations that turn into customers.</h2>
            <p className="mt-5 max-w-[480px] text-[19px] leading-relaxed text-stone-800">Connect your first channel in minutes and launch a campaign today.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Cta href="/signup">Start free trial</Cta>
              <Cta href="/pricing" variant="light">
                See pricing
              </Cta>
            </div>
            <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[14.5px] text-stone-800">
              {[`${trialDays}-day free trial`, "No card needed"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4" aria-hidden /> {t}
                </span>
              ))}
            </p>
          </div>
          <Parallax speed={0.2} className="relative">
            <div className="site-float overflow-hidden rounded-[24px]">{image}</div>
          </Parallax>
        </div>
      </Reveal>
    </section>
  );
}
