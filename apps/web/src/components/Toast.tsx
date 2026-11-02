"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Portal } from "./Portal";

/** A small pop-up at the bottom of the screen that goes away by itself. */
export function Toast({ text, onDone, ms = 2400 }: { text: string; onDone: () => void; ms?: number }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (
    <Portal>
      <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-[15px] font-medium text-white shadow-pop">
          <CheckCircle2 className="h-4 w-4 text-brand-400" aria-hidden /> {text}
        </div>
      </div>
    </Portal>
  );
}
