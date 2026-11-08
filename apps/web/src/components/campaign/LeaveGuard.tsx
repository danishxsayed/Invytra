"use client";

import { useEffect, useRef, useState } from "react";
import { btn } from "../AccountControls";
import { Modal } from "../Modal";

/**
 * Asks before leaving a campaign with unsaved changes: clicking a link elsewhere (menu, settings…)
 * opens "Leave / Keep editing"; closing or reloading the tab gets the browser's own warning.
 */
export function LeaveGuard({ dirty, launched }: { dirty: boolean; launched: boolean }) {
  const [target, setTarget] = useState<string | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      if (leaving.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-leave-ok]")) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  if (!target) return null;
  return (
    <Modal
      title={launched ? "Leave without saving?" : "Leave this campaign?"}
      description={launched ? "Your changes aren't saved. If you leave now, they're lost." : "This campaign isn't saved. If you leave now, everything you set up here is lost."}
      onClose={() => setTarget(null)}
    >
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={btn.secondary}
          onClick={() => {
            leaving.current = true;
            location.assign(target);
          }}
        >
          Leave
        </button>
        <button type="button" className={btn.primary} onClick={() => setTarget(null)}>
          Keep editing
        </button>
      </div>
    </Modal>
  );
}
