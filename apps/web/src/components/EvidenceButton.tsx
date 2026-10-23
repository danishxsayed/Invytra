"use client";

import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { Modal } from "./Modal";

/** "View screenshot" for a failed action: what LinkedIn looked like at that moment. */
export function EvidenceButton({ actionId, error }: { actionId: string; error: string }) {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Screenshot
      </button>
      {open && (
        <Modal wide title="What LinkedIn showed" description={error} onClose={() => setOpen(false)}>
          {missing ? (
            <p className="text-[15px] text-stone-500">The screenshot isn't available on this computer any more.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/app/evidence/${actionId}`}
              alt="Screenshot of the LinkedIn page when the action failed"
              onError={() => setMissing(true)}
              className="w-full rounded-lg border border-stone-200"
            />
          )}
        </Modal>
      )}
    </>
  );
}
