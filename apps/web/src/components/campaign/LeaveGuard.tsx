"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { btn } from "../AccountControls";
import { Modal } from "../Modal";

/**
 * Asks before leaving a campaign with unsaved changes: clicking a link elsewhere (menu, settings…)
 * opens "Save as draft / Leave / Keep editing"; closing or reloading the tab gets the browser's own warning.
 */
export function LeaveGuard({
  dirty,
  launched,
  canSave,
  onSaveAndGo,
}: {
  dirty: boolean;
  launched: boolean;
  /** Why saving isn't possible yet (e.g. no name), or null. */
  canSave: string | null;
  /** Saves, then goes to `href`; resolves with an error to show, or null. */
  onSaveAndGo: (href: string) => Promise<string | null>;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
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
  const go = () => {
    leaving.current = true;
    location.assign(target);
  };
  return (
    <Modal
      title={launched ? "Leave without saving your changes?" : "Leave this campaign?"}
      description={launched ? "You changed this campaign but haven't saved. If you leave now, the changes are lost." : "You haven't saved this campaign. If you leave now, everything you set up here is lost."}
      onClose={() => !busy && setTarget(null)}
      busy={busy}
    >
      <div className="space-y-4">
        {(error || canSave) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-900">{error ?? `To save it: ${canSave}`}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn.ghost} disabled={busy} onClick={() => setTarget(null)}>
            Keep editing
          </button>
          <button type="button" className={btn.secondary} disabled={busy} onClick={go}>
            Leave without saving
          </button>
          <button
            type="button"
            className={btn.primary}
            disabled={busy || !!canSave}
            onClick={async () => {
              setBusy(true);
              leaving.current = true;
              const err = await onSaveAndGo(target);
              if (err) {
                leaving.current = false;
                setBusy(false);
                setError(err);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {launched ? "Save changes and leave" : "Save as draft and leave"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
