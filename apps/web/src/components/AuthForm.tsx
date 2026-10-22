"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  placeholder?: string;
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
    <form action={formAction} className="space-y-4" noValidate>
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="text-[15px] font-medium text-stone-700">{f.label}</span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            defaultValue={f.type === "password" ? undefined : state.fields?.[f.name]}
            required
            className="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-[16px] text-stone-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200"
          />
          {f.hint && <span className="mt-1 block text-[14px] text-stone-500">{f.hint}</span>}
        </label>
      ))}
      {state.error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[15px] text-rose-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-400 px-4 py-2.5 text-[16px] font-semibold text-stone-900 shadow-glow transition hover:bg-brand-300 disabled:opacity-70"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isPending ? pending : submit}
      </button>
      <p className="pt-1 text-center text-[15px] text-stone-500">
        {footer.text}{" "}
        <Link href={footer.href} className="font-medium text-brand-800 hover:text-stone-900">
          {footer.link}
        </Link>
      </p>
    </form>
  );
}
