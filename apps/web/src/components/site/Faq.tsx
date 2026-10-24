import { Plus } from "lucide-react";

/** Questions as native <details>, so they work without JavaScript and with the keyboard. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mt-8 divide-y divide-stone-900/10 border-y border-stone-900/10">
      {items.map((f) => (
        <details key={f.q} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[18px] font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
            {f.q}
            <Plus className="h-5 w-5 shrink-0 text-stone-500 transition-transform group-open:rotate-45" aria-hidden />
          </summary>
          <p className="max-w-[680px] pb-5 text-[16px] leading-relaxed text-stone-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
