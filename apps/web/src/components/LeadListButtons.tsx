"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteListAction, renameListAction } from "@/app/app/leads/actions";
import { btn } from "./AccountControls";
import { Field, inputCls } from "./fields";
import { ImportLeads } from "./ImportLeads";
import { Modal } from "./Modal";
import type { ImportAccount } from "./SearchImport";

export function NewListButton({ label = "New list", accounts = [] }: { label?: string; accounts?: ImportAccount[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={btn.primary} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> {label}
      </button>
      {open && <ImportLeads target={{ kind: "new" }} accounts={accounts} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Add leads / rename / delete, on a list's page. */
export function ListActions({ id, name, total, accounts = [] }: { id: string; name: string; total: number; accounts?: ImportAccount[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "rename" | "delete" | null>(null);
  const [newName, setNewName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    setMode(null);
    setError(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btn.primary} onClick={() => setMode("add")}>
        <Plus className="h-4 w-4" aria-hidden /> Add leads
      </button>
      <button className={btn.secondary} onClick={() => setMode("rename")}>
        <Pencil className="h-4 w-4" aria-hidden /> Rename
      </button>
      <button className={btn.ghost} onClick={() => setMode("delete")}>
        <Trash2 className="h-4 w-4" aria-hidden /> Delete
      </button>

      {mode === "add" && <ImportLeads target={{ kind: "add", listId: id, listName: name }} accounts={accounts} onClose={close} />}

      {mode === "rename" && (
        <Modal title="Rename list" onClose={close} busy={pending}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await renameListAction(id, newName);
                if (!r.ok) return setError(r.error);
                close();
                router.refresh();
              });
            }}
          >
            <Field label="Name">
              <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} autoFocus />
            </Field>
            {error && <p role="alert" className="mt-3 text-[15px] text-rose-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={close}>
                Cancel
              </button>
              <button className={btn.primary} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {mode === "delete" && (
        <Modal title={`Delete “${name}”?`} onClose={close} busy={pending}>
          <p className="text-[15px] text-stone-600">
            The list and its {total.toLocaleString("en-US")} {total === 1 ? "lead" : "leads"} will be removed. Actions already done on LinkedIn stay in
            your activity log.
          </p>
          {error && <p role="alert" className="mt-3 text-[15px] text-rose-700">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button className={btn.secondary} onClick={close}>
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[15px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteListAction(id);
                  if (!r.ok) return setError(r.error);
                  router.push("/app/leads");
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Delete list
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
