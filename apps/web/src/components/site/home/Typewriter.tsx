"use client";

import { useEffect, useState } from "react";
import { useInView } from "../motion";

/** Types the text out once it scrolls into view, with a blinking cursor. */
export function Typewriter({ text }: { text: string }) {
  const [ref, seen] = useInView<HTMLParagraphElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(text.length);
    let k = 0;
    const t = setInterval(() => (k++, setN(k), k >= text.length && clearInterval(t)), 38);
    return () => clearInterval(t);
  }, [seen, text]);
  return (
    <p ref={ref} className="mt-2 min-h-[3.2em]" aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-brand-400 [animation:site-blink_1s_steps(1)_infinite]" />
    </p>
  );
}
