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

/** Fixed names (not Intl.DisplayNames: the server and the browser name some places differently, e.g. "Hong Kong SAR China"). */
const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", US: "United States", GB: "United Kingdom", AE: "United Arab Emirates", CA: "Canada", AU: "Australia", SG: "Singapore",
  DE: "Germany", FR: "France", NL: "Netherlands", ES: "Spain", IT: "Italy", IE: "Ireland", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", CH: "Switzerland", AT: "Austria", BE: "Belgium", PT: "Portugal", PL: "Poland", NZ: "New Zealand", ZA: "South Africa",
  SA: "Saudi Arabia", QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman", MY: "Malaysia", ID: "Indonesia", PH: "Philippines",
  TH: "Thailand", VN: "Vietnam", JP: "Japan", KR: "South Korea", HK: "Hong Kong", BR: "Brazil", MX: "Mexico", IL: "Israel",
  TR: "Türkiye", EG: "Egypt", NG: "Nigeria", KE: "Kenya", PK: "Pakistan", BD: "Bangladesh", LK: "Sri Lanka", NP: "Nepal",
};
const COUNTRIES = Object.keys(COUNTRY_NAMES);

const input = "mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] focus:border-stone-500 focus:outline-none";
const label = "block text-[14px] font-medium text-stone-700";

/** Who invoices are made out to. Used for every invoice from now on (paid ones keep what they had). */
export function BillingDetails({ value }: { value: BillingDetailsValue }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
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
            .map((c) => ({ c, n: COUNTRY_NAMES[c] ?? c }))
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
