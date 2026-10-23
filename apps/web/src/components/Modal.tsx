"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { Portal } from "./Portal";
import { cx } from "./ui";

/** Centered pop-up over a dimmed page. Escape or the backdrop closes it (unless `busy`). */
export function Modal({
  title,
  description,
  onClose,
  busy,
  wide,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
        <div
          className={cx(
            "relative flex max-h-full w-full animate-fade-up flex-col overflow-hidden rounded-2xl bg-white shadow-pop",
            wide ? "max-w-[760px]" : "max-w-[520px]",
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <h2 className="text-[19px] font-semibold text-stone-900">{title}</h2>
              {description && <p className="mt-1 text-[15px] text-stone-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 pb-6 pt-3">{children}</div>
        </div>
      </div>
    </Portal>
  );
}
