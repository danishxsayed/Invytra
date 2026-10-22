"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}

export function AuthForm({
  action,
  fields,
  submit,
  pending,
  footer,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  pending: string;
  footer: { text: string; href: string; link: string };
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="text-sm font-medium text-ink">{f.label}</span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={f.type === "password" ? undefined : state.fields?.[f.name]}
            required
            className="mt-1.5 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink shadow-[inset_0_1px_0_rgba(24,33,47,0.04)] focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/20"
          />
          {f.hint && <span className="mt-1 block text-sm text-ink-faint">{f.hint}</span>}
        </label>
      ))}
      {state.error && (
        <p role="alert" className="rounded-md bg-rose-soft px-3 py-2 text-sm text-rose">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-ink px-4 py-2.5 text-base font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
      >
        {isPending ? pending : submit}
      </button>
      <p className="text-center text-sm text-ink-soft">
        {footer.text}{" "}
        <Link href={footer.href} className="font-medium text-pine underline-offset-2 hover:underline">
          {footer.link}
        </Link>
      </p>
    </form>
  );
}
