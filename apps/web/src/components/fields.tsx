import { cx } from "./ui";

export const inputCls =
  "mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-[16px] text-stone-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-200";

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("block", className)}>
      <label className="block">
        <span className="text-[15px] font-medium text-stone-700">{label}</span>
        {children}
      </label>
      {hint && <span className="mt-1 block text-[14px] text-stone-500">{hint}</span>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 rounded-full transition",
          checked ? "bg-brand-400" : "bg-stone-200",
        )}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>
        <span className="block text-[15px] font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-[14px] text-stone-500">{hint}</span>}
      </span>
    </label>
  );
}

export function TimeZoneSelect({ zones, value, onChange, name }: { zones: string[]; value: string; onChange: (v: string) => void; name?: string }) {
  const list = zones.includes(value) ? zones : [value, ...zones];
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {list.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
