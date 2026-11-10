"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteWorkspaceAction } from "@/app/workspace/settings/actions";
import { Modal } from "./Modal";

const input = "mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-[15px] font-normal focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100";

/** Owner only: deletes the whole workspace after typing its name and their password. */
export function DeleteWorkspace({ workspace, credits }: { workspace: string; credits: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const ready = name.trim().toLowerCase() === workspace.trim().toLowerCase() && password.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-[15px] text-stone-600">Deletes this workspace and everything in it for everyone. This can't be undone.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-[15px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Delete workspace
      </button>

      {open && (
        <Modal title={`Delete ${workspace}?`} onClose={() => (setOpen(false), setError(""))} busy={pending}>
          <div className="space-y-4 text-[15px] text-stone-600">
            <p className="flex gap-2.5 rounded-xl bg-rose-50 px-3.5 py-3 text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              This can't be undone. Everyone in this workspace loses access.
            </p>
            <div>
              <p className="font-medium text-stone-800">What's deleted</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>All campaigns are stopped, then deleted with their lists, leads and inbox.</li>
                <li>Your LinkedIn accounts and mailboxes are disconnected from Invytra.</li>
                <li>Your voice copies and recorded videos are deleted.</li>
                {credits > 0 && <li>Your {credits.toLocaleString("en-US")} unused AI credits are lost.</li>}
                <li>Logins of people who are only in this workspace, including yours.</li>
              </ul>
              <p className="mt-2 text-[14px] text-stone-500">Paid invoices are kept, as tax law requires.</p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!ready) return;
                start(async () => {
                  setError("");
                  const r = await deleteWorkspaceAction({ name, password });
                  // On success the page moves to the login screen.
                  if (r && !r.ok) setError(r.error);
                });
              }}
            >
              <label className="block text-[14px] font-medium text-stone-800">
                Type <b>{workspace}</b> to confirm
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" disabled={pending} />
              </label>
              <label className="block text-[14px] font-medium text-stone-800">
                Your password
                <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={pending} />
              </label>
              {error && <p className="text-[14px] text-rose-700">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-[15px] font-medium text-stone-700 hover:bg-stone-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!ready || pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[15px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete workspace forever
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
