"use client";

import { TEMPLATE_TOKENS } from "@invytra/shared";
import { useRef } from "react";
import { inputCls } from "../fields";
import { cx } from "../ui";

const TOKEN_LABEL: Record<string, string> = { firstName: "First name", lastName: "Last name", name: "Full name", company: "Company", title: "Job title" };

/** A note/message box with one-click placeholders and a character counter. */
export function TextTemplate({
  value,
  onChange,
  max,
  softMax,
  softMaxHint,
  placeholder,
  label,
  disabled,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  softMax?: number;
  softMaxHint?: string;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const text = `{${token}}`;
    if (!el) return onChange(value + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > max) return;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const len = value.length;
  return (
    <div>
      <textarea
        ref={ref}
        aria-label={label}
        className={cx(inputCls, "resize-y leading-relaxed")}
        rows={rows}
        value={value}
        maxLength={max}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => insert(t)}
              className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[13px] font-medium text-stone-600 transition hover:border-brand-500 hover:bg-brand-50 hover:text-stone-900 disabled:opacity-50"
              title={`Insert {${t}}`}
            >
              + {TOKEN_LABEL[t]}
            </button>
          ))}
        </div>
        <span className={cx("text-[13px] tabular-nums", softMax && len > softMax ? "text-amber-700" : "text-stone-400")}>
          {len}/{max}
          {softMax && len > softMax && softMaxHint ? ` · ${softMaxHint}` : ""}
        </span>
      </div>
    </div>
  );
}
