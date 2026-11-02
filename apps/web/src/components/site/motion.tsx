"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Small scroll-motion helpers for the public site (no animation library): elements rise in
 * as they enter the view, drift at their own speed while scrolling, and sections can read
 * how far they've been scrolled. All of it is skipped for people who prefer reduced motion.
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has come into view (stays true). */
export function useInView<T extends Element>(margin = "0px 0px -12% 0px"): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen];
}

/** Rises and sharpens into place when scrolled into view. */
export function Reveal({ children, delay = 0, y = 28, className, as: Tag = "div" }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "li" | "section" | "span" }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag ref={ref as never} data-shown={seen} className={`reveal ${className ?? ""}`} style={{ "--ry": `${y}px`, transitionDelay: `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Calls fn(progress) on scroll: 0 when the element's top reaches the bottom of the screen, 1 when its bottom leaves the top. */
export function useScroll<T extends HTMLElement>(fn: (p: number, el: T) => void) {
  const ref = useRef<T>(null);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = r.height + window.innerHeight;
      cb.current(Math.min(1, Math.max(0, (window.innerHeight - r.top) / total)), el);
    };
    const on = () => (raf ||= requestAnimationFrame(update));
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => (window.removeEventListener("scroll", on), window.removeEventListener("resize", on), cancelAnimationFrame(raf));
  }, []);
  return ref;
}

/** Drifts up (speed > 0) or down while the page scrolls past, for depth. */
export function Parallax({ children, speed = 0.12, className }: { children: ReactNode; speed?: number; className?: string }) {
  const ref = useScroll<HTMLDivElement>((p, el) => {
    el.style.transform = `translate3d(0, ${((0.5 - p) * speed * 600).toFixed(1)}px, 0)`;
  });
  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
