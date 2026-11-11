"use client";

import { useEffect, useRef } from "react";

/**
 * Ask Invy's "searching" animation (Lottie, made in After Effects: public/lottie/invy-searching.json).
 * With "reduce motion" on, it shows a still frame (pins found and checked).
 */
export function InvyLoader({ size = 96, label = "Invy is searching" }: { size?: number; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: { destroy: () => void; goToAndStop: (f: number, isFrame: boolean) => void } | null = null;
    let gone = false;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // The light build (SVG only, no expressions) keeps it small; loaded only when shown.
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (gone || !box.current) return;
      anim = lottie.loadAnimation({ container: box.current, renderer: "svg", loop: !still, autoplay: !still, path: "/lottie/invy-searching.json" });
      if (still) (anim as unknown as { addEventListener: (e: string, f: () => void) => void }).addEventListener("DOMLoaded", () => anim?.goToAndStop(78, true));
    });
    return () => {
      gone = true;
      anim?.destroy();
    };
  }, []);
  return <div ref={box} role="img" aria-label={label} style={{ width: size, height: size }} className="shrink-0" />;
}
