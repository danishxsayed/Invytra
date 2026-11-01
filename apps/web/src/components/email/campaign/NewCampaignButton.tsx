"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEmailCampaignAction } from "@/app/email/campaigns/actions";
import { btn } from "../../AccountControls";
import { Field, inputCls } from "../../fields";
import { Modal } from "../../Modal";

export function NewCampaignButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await createEmailCampaignAction(name);
      if (!r.ok) return setError(r.error);
      router.push(`/email/campaigns/${r.value.id}`);
    });
  };
  return (
    <>
      <button className={btn.primary} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> New campaign
      </button>
      {open && (
        <Modal title="New email campaign" description="Name it; you'll add leads, write the emails and choose mailboxes next." onClose={() => !pending && setOpen(false)} busy={pending}>
          <form onSubmit={create} className="space-y-4">
            <Field label="Campaign name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Flooring contractors, US" autoFocus required maxLength={80} />
            </Field>
            {error && <p role="alert" className="text-[14px] text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
              <button className={btn.primary} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
