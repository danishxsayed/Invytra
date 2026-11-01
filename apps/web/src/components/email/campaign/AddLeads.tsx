"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addListsToCampaignAction } from "@/app/email/campaigns/actions";
import type { AddContactsResult } from "@/lib/email-campaigns";
import { btn } from "../../AccountControls";
import { inputCls } from "../../fields";
import { cx } from "../../ui";
import { ImportContactsButton } from "../contacts/ImportContacts";

export function addedText(r: AddContactsResult): string {
  const skipped = [
    r.alreadyInCampaign && `${r.alreadyInCampaign} already in this campaign`,
    r.unsubscribed && `${r.unsubscribed} unsubscribed`,
    r.bounced && `${r.bounced} bounced before`,
    r.suppressed && `${r.suppressed} on the suppression list`,
    r.invalid && `${r.invalid} failed verification`,
    r.doNotContact && `${r.doNotContact} replied or bounced in another campaign`,
  ].filter(Boolean);
  return `Added ${r.added} lead${r.added === 1 ? "" : "s"} to this campaign${skipped.length ? `. Not added: ${skipped.join(", ")}` : ""}.`;
}

/** Leads for a campaign: a contact list, or a CSV (imported as a list, then added). */
export function AddLeads({ id, lists, variables }: { id: string; lists: { id: string; name: string; count: number }[]; variables: { key: string; label: string }[] }) {
  const router = useRouter();
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {lists.length > 0 && (
          <>
            <select className={cx(inputCls, "mt-0 w-auto max-w-[300px] py-2 text-[14.5px]")} value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Contact list">
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </option>
              ))}
            </select>
            <button
              className={btn.primary}
              disabled={pending || !listId}
              onClick={() =>
                start(async () => {
                  const r = await addListsToCampaignAction(id, [listId]);
                  setNote(r.ok ? { ok: true, text: addedText(r.value) } : { ok: false, text: r.error });
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Add list
            </button>
            <span className="text-[14px] text-stone-500">or</span>
          </>
        )}
        <ImportContactsButton
          lists={lists}
          variables={variables}
          label="Upload a CSV"
          primary={lists.length === 0}
          after={async (res) => {
            const r = await addListsToCampaignAction(id, [res.listId]);
            return r.ok ? addedText(r.value) : r.error;
          }}
        />
      </div>
      {note && <p className={cx("rounded-lg px-3 py-2 text-[14px]", note.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-800")}>{note.text}</p>}
      <p className="text-[13px] text-stone-500">Unsubscribed, bounced, suppressed and invalid addresses are never added. Manage contacts and lists on the Contacts tab.</p>
    </div>
  );
}
