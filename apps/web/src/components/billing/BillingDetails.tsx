"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBillingProfileAction } from "@/app/workspace/billing/actions";
import { btn } from "../AccountControls";

export interface BillingDetailsValue {
  legalName: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
}

const COUNTRIES = "IN US GB AE CA AU SG DE FR NL ES IT IE SE NO DK FI CH AT BE PT PL NZ ZA SA QA KW BH OM MY ID PH TH VN JP KR HK BR MX IL TR EG NG KE PK BD LK NP".split(" ");

const input = "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] focus:border-stone-500 focus:outline-none";
const label = "block text-[14px] font-medium text-stone-700";

/** Who invoices are made out to. Used for every invoice from now on (paid ones keep what they had). */
export function BillingDetails({ value }: { value: BillingDetailsValue }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const f = (k: keyof BillingDetailsValue) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBillingProfileAction({ ...v, gstin: v.country === "IN" ? v.gstin : "" });
          setMsg(r.ok ? { ok: true, text: "Saved. New invoices use these details." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className={`${label} sm:col-span-2`}>
        Company or full name
        <input className={input} autoComplete="organization" required maxLength={120} {...f("legalName")} />
      </label>
      <label className={label}>
        Billing email
        <input className={input} type="email" autoComplete="email" required maxLength={200} {...f("email")} />
      </label>
      <label className={label}>
        Country
        <select className={input} required {...f("country")}>
          <option value="">Choose…</option>
          {[...new Set([...(v.country && !COUNTRIES.includes(v.country) ? [v.country] : []), ...COUNTRIES])]
            .map((c) => ({ c, n: names.of(c) ?? c }))
            .sort((a, b) => a.n.localeCompare(b.n))
            .map(({ c, n }) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
        </select>
      </label>
      <label className={`${label} sm:col-span-2`}>
        Address
        <input className={input} autoComplete="address-line1" required maxLength={200} {...f("addressLine1")} />
        <input className={`${input} mt-2`} autoComplete="address-line2" maxLength={200} placeholder="Building, floor (optional)" {...f("addressLine2")} />
      </label>
      <label className={label}>
        City
        <input className={input} autoComplete="address-level2" required maxLength={100} {...f("city")} />
      </label>
      <label className={label}>
        State / region
        <input className={input} autoComplete="address-level1" maxLength={100} {...f("state")} />
      </label>
      <label className={label}>
        Postal code
        <input className={input} autoComplete="postal-code" maxLength={20} {...f("postalCode")} />
      </label>
      {v.country === "IN" && (
        <label className={label}>
          GSTIN <span className="font-normal text-stone-400">(optional, for GST invoices)</span>
          <input className={`${input} uppercase`} maxLength={15} placeholder="29ABCDE1234F1Z5" {...f("gstin")} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save billing details
        </button>
        {msg && <p className={msg.ok ? "text-[14px] text-emerald-700" : "text-[14px] text-rose-700"}>{msg.text}</p>}
      </div>
    </form>
  );
}
