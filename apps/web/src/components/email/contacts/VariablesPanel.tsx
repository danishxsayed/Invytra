"use client";

import { BUILT_IN_VARS } from "@invytra/shared";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createVariableAction, deleteVariableAction, updateVariableFallbackAction } from "@/app/email/contacts/actions";
import { btn } from "../../AccountControls";
import { Field, inputCls } from "../../fields";
import { cx } from "../../ui";

type Variable = { id: string; key: string; label: string; fallback: string };

function Row({ v }: { v: Variable }) {
  const router = useRouter();
  const [fallback, setFallback] = useState(v.fallback);
  const [pending, start] = useTransition();
  return (
    <tr>
      <td className="px-3 py-2 font-mono text-[13.5px] text-stone-900">{`{{${v.key}}}`}</td>
      <td className="px-3 py-2">
        <input
          className={cx(inputCls, "mt-0 py-1.5 text-[14px]")}
          value={fallback}
          placeholder="No fallback: contacts without a value are skipped"
          onChange={(e) => setFallback(e.target.value)}
          onBlur={() => fallback !== v.fallback && start(async () => void ((await updateVariableFallbackAction(v.id, fallback)).ok && router.refresh()))}
          maxLength={200}
        />
      </td>
      <td className="px-3 py-2 text-right">
        {pending ? (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-stone-400" aria-hidden />
        ) : (
          <button className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={`Delete {{${v.key}}}`} onClick={() => start(async () => void ((await deleteVariableAction(v.id)).ok && router.refresh()))}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </td>
    </tr>
  );
}

/** Built-in and custom variables; custom ones come from CSV columns or are made here, each with an optional default fallback. */
export function VariablesPanel({ variables }: { variables: Variable[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [fallback, setFallback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-semibold text-stone-900">Built in</p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          {BUILT_IN_VARS.map((v) => (
            <code key={v} className="rounded-md bg-stone-100 px-2 py-0.5 text-[13px] text-stone-700">{`{{${v}}}`}</code>
          ))}
          <code className="rounded-md bg-violet-50 px-2 py-0.5 text-[13px] text-violet-700">{"{{random:Hi|Hello}}"}</code>
          <code className="rounded-md bg-stone-100 px-2 py-0.5 text-[13px] text-stone-700" title="Where the unsubscribe line goes (when the campaign shows it)">{"{{unsubscribe}}"}</code>
        </p>
        <p className="mt-2 text-[14px] text-stone-500">
          Add a fallback right in the email with a bar: <code className="text-stone-700">{"{{first_name|there}}"}</code> writes “there” when a contact has no first name.
        </p>
      </div>
      <div>
        <p className="mb-2 text-[15px] font-semibold text-stone-900">Custom variables</p>
        {variables.length ? (
          <div className="overflow-x-auto rounded-xl ring-1 ring-stone-200">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-stone-50 text-[12.5px] text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Variable</th>
                  <th className="px-3 py-2 font-medium">Default when a contact has no value</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {variables.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[14px] text-stone-500">None yet. Columns of your CSV imports become variables automatically, or create one here.</p>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl bg-stone-50 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await createVariableAction({ label, fallback });
            if (!r.ok) return setError(r.error);
            setLabel("");
            setFallback("");
            router.refresh();
          });
        }}
      >
        <Field label="New variable" hint="e.g. Pain point → {{pain_point}}" className="w-60">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} required />
        </Field>
        <Field label="Default (optional)" hint="Used when a contact has no value." className="w-60">
          <input className={inputCls} value={fallback} onChange={(e) => setFallback(e.target.value)} maxLength={200} />
        </Field>
        <button className={cx(btn.primary, "mb-[22px]")} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Create
        </button>
        {error && <p role="alert" className="w-full text-[14px] text-rose-700">{error}</p>}
      </form>
    </div>
  );
}
