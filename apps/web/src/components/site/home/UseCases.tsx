"use client";

import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../../ui";
import { Reveal, useInView } from "../motion";
import { Eyebrow, h2 } from "./bits";

export interface UseCase {
  id: string;
  label: string;
  title: string;
  body: string;
  points: string[];
  image: ReactNode;
}

const EVERY = 7000;

/** Who it's for: tabs that move on by themselves (a bar shows when), pause on hover, and crossfade the photo. */
export function UseCases({ cases }: { cases: UseCase[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>();
  useEffect(() => {
    if (paused || !seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % cases.length), EVERY);
    return () => clearTimeout(t);
  }, [i, paused, seen, cases.length]);
  const c = cases[i]!;
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-28">
      <Reveal className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[640px]">
          <Eyebrow>Who it's for</Eyebrow>
          <h2 className={`${h2} mt-4 text-stone-900`}>Made for teams that grow through conversations.</h2>
        </div>
      </Reveal>
      <div ref={ref} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="mt-10">
        <div role="tablist" aria-label="Who it's for" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {cases.map((x, k) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={k === i}
              onClick={() => setI(k)}
              className={cx("relative shrink-0 overflow-hidden whitespace-nowrap rounded-full border px-5 py-2.5 text-[15px] font-medium transition-colors duration-300", k === i ? "border-stone-900 bg-stone-900 text-white" : "border-stone-900/12 bg-white text-stone-600 hover:text-stone-900")}
            >
              {x.label}
              {k === i && !paused && seen && <span key={`${i}`} aria-hidden className="absolute inset-x-3 bottom-1 h-[2px] origin-left rounded-full bg-brand-400" style={{ animation: `site-grow ${EVERY}ms linear both` }} />}
            </button>
          ))}
        </div>
        <div className="relative mt-6 overflow-hidden rounded-[32px] bg-stone-200">
          <div className="grid">
            {cases.map((x, k) => (
              <div key={x.id} aria-hidden={k !== i} className={cx("col-start-1 row-start-1 transition-[opacity,transform] duration-[900ms] ease-out", k === i ? "scale-100 opacity-100" : "scale-[1.04] opacity-0")}>
                <div className="aspect-[4/3] w-full sm:aspect-[16/9] lg:aspect-[21/10]">{x.image}</div>
              </div>
            ))}
          </div>
          <div key={c.id} className="relative m-3 animate-fade-up rounded-[24px] bg-white/95 p-6 shadow-pop backdrop-blur sm:absolute sm:bottom-6 sm:left-6 sm:m-0 sm:max-w-[440px] sm:p-8">
            <h3 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-stone-900 sm:text-[30px]">{c.title}</h3>
            <p className="mt-3 text-[16.5px] leading-relaxed text-stone-600">{c.body}</p>
            <ul className="mt-5 space-y-2">
              {c.points.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15.5px] text-stone-800">
                  <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
