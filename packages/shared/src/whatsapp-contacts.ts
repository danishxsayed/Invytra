import { phoneKey } from "./do-not-contact.js";
import { parseCsv, splitName } from "./leads.js";
import { varKey } from "./email-vars.js";

/*
 * WhatsApp contacts: who may be messaged (consent), who said stop (opt-out keywords), and
 * reading them from a CSV (phone column, names, tags, custom variables). Runs in the browser
 * (import preview) and on the server (the import, the webhook), with the same rules.
 */

export const WA_IMPORT = { maxRows: 20_000, maxBytes: 5_000_000 } as const;

/** Where a contact's permission to be messaged came from. */
export const WA_CONSENT = {
  IMPORT: "Imported (you confirmed consent)",
  MANUAL: "Added by hand (you confirmed consent)",
  INBOUND: "Messaged you first",
  LINK: "Chat link or QR code",
} as const;
export type WaConsentSource = keyof typeof WA_CONSENT;

/** Replies that opt someone out at once (any case, the whole message). */
export const WA_OPT_OUT_WORDS = ["stop", "stopall", "unsubscribe", "unsub", "cancel", "end", "quit", "opt out", "optout", "remove me", "إلغاء", "الغاء", "توقف", "ايقاف", "إيقاف", "الغاء الاشتراك", "إلغاء الاشتراك", "बंद करो", "रोकें"];

/** True when a reply is an opt-out ("STOP", "Stop.", "unsubscribe 🙏"). */
export function isOptOut(text: string | null | undefined): boolean {
  const t = (text ?? "")
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/[.!؟?,،"'*_~\s]+/g, " ")
    .trim();
  return !!t && WA_OPT_OUT_WORDS.includes(t);
}

/** "VIP Clients" → "vip-clients" (tags are short, lowercase, no spaces). */
export function waTag(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
export const waTags = (raw: string) => [...new Set(raw.split(/[,;|]/).map(waTag).filter(Boolean))].slice(0, 20);

/* ---------- CSV ---------- */

export type WaColumnTarget = "skip" | "phone" | "first_name" | "last_name" | "full_name" | "email" | "company_name" | "tags" | `custom:${string}`;

export const WA_FIELD_LABEL: Record<Exclude<WaColumnTarget, `custom:${string}`>, string> = {
  skip: "Don't import",
  phone: "WhatsApp number",
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (split into first and last)",
  email: "Email",
  company_name: "Company name",
  tags: "Tags (comma separated)",
};

export interface WaCsvTable {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
}

export function readPhoneCsv(text: string): WaCsvTable {
  const all = parseCsv(text);
  if (!all.length) return { headers: [], rows: [], hasHeader: true };
  const first = all[0]!;
  if (first.some((c) => phoneKey(c))) {
    const width = Math.max(...all.slice(0, 50).map((r) => r.length));
    return { headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows: all, hasHeader: false };
  }
  return { headers: first.map((h, i) => h.trim() || `Column ${i + 1}`), rows: all.slice(1), hasHeader: true };
}

const NAMED: [RegExp, WaColumnTarget][] = [
  [/^(whats\s*app|wa|mobile|phone|cell|contact)(\s*(number|no\.?|#))?$|^(phone|mobile)\s*number$/i, "phone"],
  [/^first(\s*name)?$|^given\s*name$/i, "first_name"],
  [/^last(\s*name)?$|^surname$|^family\s*name$/i, "last_name"],
  [/^(full\s*)?name$|^contact\s*name$/i, "full_name"],
  [/^e-?mail(\s*address)?$/i, "email"],
  [/^company(\s*name)?$|^business(\s*name)?$|^organi[sz]ation$/i, "company_name"],
  [/^tags?$|^labels?$|^groups?$|^segments?$/i, "tags"],
];

export function detectPhoneMapping(t: WaCsvTable): WaColumnTarget[] {
  const used = new Set<WaColumnTarget>();
  const out = t.headers.map((h): WaColumnTarget => {
    const hit = t.hasHeader ? NAMED.find(([re]) => re.test(h.trim()))?.[1] : undefined;
    if (hit && !used.has(hit)) {
      used.add(hit);
      return hit;
    }
    const key = varKey(h);
    return t.hasHeader && key ? `custom:${key}` : "skip";
  });
  if (!out.includes("phone")) {
    const at = t.headers.findIndex((_, i) => t.rows.slice(0, 20).filter((r) => phoneKey(r[i])).length >= Math.min(3, t.rows.length));
    if (at >= 0) out[at] = "phone";
  }
  return out;
}

export function phoneMappingProblem(mapping: WaColumnTarget[]): string | null {
  const phones = mapping.filter((m) => m === "phone").length;
  if (!phones) return "Choose which column holds the WhatsApp number.";
  if (phones > 1) return "Only one column can be the WhatsApp number.";
  const fields = mapping.filter((m) => m !== "skip");
  return new Set(fields).size === fields.length ? null : "Two columns are mapped to the same field.";
}

export interface WaContactRow {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  tags: string[];
  vars: Record<string, string>;
}

/** A number as typed into a full one: "+…" and "00…" are full; others get the default country code (a leading 0 is dropped). */
export function withCountry(raw: string, cc: string): string | null {
  const t = raw.trim();
  if (/^(\+|00)/.test(t) || !cc) return phoneKey(t);
  const d = t.replace(/[\s().-]/g, "");
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("0")) return phoneKey(`+${cc}${d.slice(1)}`);
  return d.startsWith(cc) && d.length >= cc.length + 8 ? phoneKey(`+${d}`) : phoneKey(`+${cc}${d}`);
}

export interface WaContactParse {
  contacts: WaContactRow[];
  invalid: { row: number; value: string; reason: string }[];
  duplicates: number;
  overLimit: number;
  customKeys: string[];
}

/** Rows into contacts; a number without a country code gets `defaultCountry` (digits, e.g. "971") if given. */
export function applyPhoneMapping(t: WaCsvTable, mapping: WaColumnTarget[], defaultCountry = ""): WaContactParse {
  const at = (x: WaColumnTarget) => mapping.indexOf(x);
  const phoneAt = at("phone");
  const custom = mapping.map((m, i) => ({ m, i })).filter((x): x is { m: `custom:${string}`; i: number } => x.m.startsWith("custom:"));
  const out: WaContactParse = { contacts: [], invalid: [], duplicates: 0, overLimit: 0, customKeys: [...new Set(custom.map((c) => c.m.slice(7)))] };
  if (phoneAt < 0) return out;
  const seen = new Set<string>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
  const cc = defaultCountry.replace(/\D/g, "");
  t.rows.forEach((r, idx) => {
    const row = idx + (t.hasHeader ? 2 : 1);
    const raw = (r[phoneAt] ?? "").trim();
    if (!raw) return void out.invalid.push({ row, value: r.join(", ").slice(0, 80), reason: "No number" });
    const phone = withCountry(raw, cc);
    if (!phone) return void out.invalid.push({ row, value: raw.slice(0, 40), reason: "Not a full number with country code" });
    if (seen.has(phone)) return void out.duplicates++;
    seen.add(phone);
    if (out.contacts.length >= WA_IMPORT.maxRows) return void out.overLimit++;
    let first = cell(r, at("first_name"));
    let last = cell(r, at("last_name"));
    if (!first && !last && at("full_name") >= 0) [first, last] = splitName(cell(r, at("full_name")));
    const vars: Record<string, string> = {};
    for (const c of custom) {
      const v = cell(r, c.i);
      if (v) vars[c.m.slice(7)] = v.slice(0, 1000);
    }
    const email = cell(r, at("email"));
    out.contacts.push({ phone, firstName: first?.slice(0, 80) ?? null, lastName: last?.slice(0, 80) ?? null, email: email && /@/.test(email) ? email.toLowerCase().slice(0, 200) : null, company: cell(r, at("company_name"))?.slice(0, 200) ?? null, tags: waTags(cell(r, at("tags")) ?? ""), vars });
  });
  return out;
}

export const SAMPLE_WA_CSV = "WhatsApp Number,First Name,Last Name,Company Name,Tags,City\n+971501234567,Omar,Haddad,Gulf Traders,\"dubai,warm\",Dubai\n+919876543210,Priya,Shah,Shah Exports,india,Mumbai\n";

/** How a stored number is shown: "+971501234567". */
export const formatPhone = (digits: string) => `+${digits}`;
