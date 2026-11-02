"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../../ui";
import { Reveal } from "../motion";
import { Eyebrow, h2 } from "./bits";

const ITEMS = [
  { title: "A human pace on LinkedIn", body: "Safe daily limits, office hours in each account's time zone, and no two days the same. New accounts warm up slowly." },
  { title: "Email that lands in the inbox", body: "Warm-up, sending caps per mailbox, rotation across mailboxes and a check of your domain's settings before you send." },
  { title: "WhatsApp done the official way", body: "Built on the official WhatsApp Business API, with approved templates, so your number stays in good standing." },
  { title: "Your passwords stay yours", body: "You log in to LinkedIn yourself in a secure window. Mailbox passwords are encrypted and never shown again." },
  { title: "Respect built in", body: "Unsubscribe links, bounce handling and a do-not-contact list on every campaign. Replies stop follow-ups at once." },
  { title: "Stops at the first warning", body: "A security check or a limit notice pauses that account immediately and tells you why. Nothing retries on its own." },
];

/** Dark section: the safety promises, each lighting up as it reaches the middle of the screen. */
export function Careful() {
  const [on, setOn] = useState(0);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOn(Number((e.target as HTMLElement).dataset.i))), { rootMargin: "-48% 0px -48% 0px" });
    list.current?.querySelectorAll("li").forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, []);
  return (
    <section id="safety" className="scroll-mt-16 bg-[#14140F] text-white">
      <div className="mx-auto grid max-w-[1180px] gap-14 px-5 py-28 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Reveal>
            <Eyebrow dark>Careful by default</Eyebrow>
            <h2 className={`${h2} mt-4`}>Protects your accounts and your good name.</h2>
            <p className="mt-5 max-w-[440px] text-[18px] leading-relaxed text-white/65">Outreach only works if people trust it. These settings are on from day one, on every channel.</p>
          </Reveal>
        </div>
        <ol ref={list} className="relative space-y-2 border-l border-white/10 pl-8">
          <span aria-hidden className="absolute -left-px top-0 w-[2px] bg-brand-400 transition-all duration-500" style={{ height: `${((on + 1) / ITEMS.length) * 100}%` }} />
          {ITEMS.map((x, k) => (
            <li key={x.title} data-i={k} className={cx("relative py-6 transition-opacity duration-500", k === on ? "opacity-100" : "opacity-40")}>
              <span aria-hidden className={cx("absolute -left-[37px] top-8 h-2.5 w-2.5 rounded-full transition-colors duration-500", k <= on ? "bg-brand-400" : "bg-white/25")} />
              <h3 className="font-display text-[24px] font-semibold tracking-[-0.02em]">{x.title}</h3>
              <p className="mt-2 max-w-[520px] text-[17px] leading-relaxed text-white/70">{x.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
