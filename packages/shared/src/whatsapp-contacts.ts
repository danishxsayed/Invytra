import { phoneKey } from "./do-not-contact.js";
import { parseCsv, splitName } from "./leads.js";
import { varKey } from "./email-vars.js";
import { DIAL_CODES } from "./dial-codes.js";

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

/* ---------- Import (CSV or Excel, read into rows) ---------- */

export type WaColumnTarget =
  | "skip"
  | "phone"
  | "country_code"
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "user_id"
  | "company_name"
  | "tags"
  | "consent"
  | "appointment"
  | "location"
  | `custom:${string}`;

export const WA_FIELD_LABEL: Record<Exclude<WaColumnTarget, `custom:${string}`>, string> = {
  skip: "Don't import",
  phone: "WhatsApp number",
  country_code: "Country code",
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (split into first and last)",
  email: "Email",
  user_id: "User ID",
  company_name: "Company name",
  tags: "Tags (comma separated)",
  consent: "WhatsApp opted in (yes / no)",
  appointment: "Appointment time",
  location: "Location",
};

/** The fields the import screen asks a column for, one card each, in order. */
export const WA_IMPORT_FIELDS = [
  { key: "full_name", label: "Full name", hint: "Split into first and last name" },
  { key: "phone", label: "Phone number", hint: "With or without the country code", required: true },
  { key: "country_code", label: "Country code", hint: "Only if your file has its own column" },
  { key: "email", label: "Email address" },
  { key: "user_id", label: "User ID", hint: "Your CRM or app ID: matched first on re-import" },
  { key: "company_name", label: "Company" },
  { key: "tags", label: "Tags", hint: "Comma-separated" },
  { key: "consent", label: "WhatsApp opted in", hint: "yes / no / true / false" },
  { key: "appointment", label: "Appointment time", hint: "Usable in templates as {{appointment_time}}" },
  { key: "location", label: "Location", hint: "Usable in templates as {{location}}" },
] as const satisfies readonly { key: WaColumnTarget; label: string; hint?: string; required?: boolean }[];
export type WaImportField = (typeof WA_IMPORT_FIELDS)[number]["key"];

export interface WaCsvTable {
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
}

/** Rows (from a CSV or a spreadsheet) into a table: the first row is the header unless it holds a phone number. */
export function phoneTable(all: string[][]): WaCsvTable {
  const rows = all.filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return { headers: [], rows: [], hasHeader: true };
  const first = rows[0]!;
  if (first.some((c) => phoneKey(c))) {
    const width = Math.max(...rows.slice(0, 50).map((r) => r.length));
    return { headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows, hasHeader: false };
  }
  return { headers: first.map((h, i) => h.trim() || `Column ${i + 1}`), rows: rows.slice(1), hasHeader: true };
}
export const readPhoneCsv = (text: string): WaCsvTable => phoneTable(parseCsv(text));

/** A table back into CSV text (spreadsheets are sent to the server this way). */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
}

const NAMED: [RegExp, WaColumnTarget][] = [
  [/^(whats\s*app|wa|mobile|phone|cell|contact)(\s*(number|no\.?|#))?$|^(phone|mobile)\s*number$/i, "phone"],
  [/^(country|dial(ing)?|calling)\s*code$|^isd(\s*code)?$|^cc$/i, "country_code"],
  [/^first(\s*name)?$|^given\s*name$/i, "first_name"],
  [/^last(\s*name)?$|^surname$|^family\s*name$/i, "last_name"],
  [/^(full\s*)?name$|^contact\s*name$|^customer(\s*name)?$/i, "full_name"],
  [/^e-?mail(\s*address)?$/i, "email"],
  [/^(user|customer|client|crm|external)[\s_-]*id$|^id$/i, "user_id"],
  [/^company(\s*name)?$|^business(\s*name)?$|^organi[sz]ation$/i, "company_name"],
  [/^tags?$|^labels?$|^groups?$|^segments?$/i, "tags"],
  [/^(whats\s*app|wa)?\s*(opt(ed)?[\s-]*in|opted|consent|subscribed)$/i, "consent"],
  [/^appointment(\s*(time|date|at))?$|^booking(\s*(time|date))?$/i, "appointment"],
  [/^location$|^city(\s*,?\s*state)?$|^address$|^area$/i, "location"],
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

/** Field → column index (-1 = none), read from a column mapping. */
export function fieldColumns(mapping: WaColumnTarget[]): Record<WaImportField, number> {
  return Object.fromEntries(WA_IMPORT_FIELDS.map((f) => [f.key, mapping.indexOf(f.key)])) as Record<WaImportField, number>;
}

/** Points a field at a column (or none): whatever that column was before becomes a custom variable or is skipped. */
export function setFieldColumn(t: WaCsvTable, mapping: WaColumnTarget[], field: WaImportField, col: number): WaColumnTarget[] {
  const loose = (i: number): WaColumnTarget => {
    const key = t.hasHeader ? varKey(t.headers[i] ?? "") : "";
    return key ? `custom:${key}` : "skip";
  };
  return mapping.map((m, i) => {
    if (i === col) return field;
    if (m === field) return loose(i);
    if (field === "full_name" && (m === "first_name" || m === "last_name")) return loose(i);
    return m;
  });
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
  externalId: string | null;
  location: string | null;
  tags: string[];
  vars: Record<string, string>;
  /** From a consent column: true / false; null when the file has none. */
  consent: boolean | null;
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

/** "yes", "Y", "true", "1", "opted in" → true; "no", "false", "0" → false; anything else → null. */
export function readYesNo(raw: string | null | undefined): boolean | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (/^(y|yes|true|1|opted[\s-]*in|subscribed|agreed|haan|ha)$/.test(t)) return true;
  if (/^(n|no|false|0|opted[\s-]*out|unsubscribed|nahi)$/.test(t)) return false;
  return null;
}

export interface WaContactParse {
  contacts: WaContactRow[];
  invalid: { row: number; value: string; reason: string }[];
  duplicates: number;
  overLimit: number;
  customKeys: string[];
}

/** Rows into contacts; a number without a country code gets the row's country code column, else `defaultCountry` (digits, e.g. "971"). Same number twice: the last row wins. */
export function applyPhoneMapping(t: WaCsvTable, mapping: WaColumnTarget[], defaultCountry = ""): WaContactParse {
  const at = (x: WaColumnTarget) => mapping.indexOf(x);
  const phoneAt = at("phone");
  const custom = mapping.map((m, i) => ({ m, i })).filter((x): x is { m: `custom:${string}`; i: number } => x.m.startsWith("custom:"));
  const out: WaContactParse = { contacts: [], invalid: [], duplicates: 0, overLimit: 0, customKeys: [...new Set(custom.map((c) => c.m.slice(7)))] };
  if (phoneAt < 0) return out;
  const byPhone = new Map<string, number>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
  const cc = defaultCountry.replace(/\D/g, "");
  const consentAt = at("consent");
  t.rows.forEach((r, idx) => {
    const row = idx + (t.hasHeader ? 2 : 1);
    const raw = (r[phoneAt] ?? "").trim();
    if (!raw) return void out.invalid.push({ row, value: r.join(", ").slice(0, 80), reason: "No number" });
    const rowCc = cell(r, at("country_code"))?.replace(/\D/g, "") || cc;
    const phone = withCountry(raw, rowCc);
    if (!phone) return void out.invalid.push({ row, value: raw.slice(0, 40), reason: rowCc ? "Not a valid number" : "No country code: choose a default one" });
    let first = cell(r, at("first_name"));
    let last = cell(r, at("last_name"));
    if (!first && !last && at("full_name") >= 0) [first, last] = splitName(cell(r, at("full_name")));
    const vars: Record<string, string> = {};
    for (const c of custom) {
      const v = cell(r, c.i);
      if (v) vars[c.m.slice(7)] = v.slice(0, 1000);
    }
    const appointment = cell(r, at("appointment"));
    if (appointment) vars.appointment_time = appointment.slice(0, 200);
    const location = cell(r, at("location"));
    if (location) vars.location = location.slice(0, 200);
    const email = cell(r, at("email"));
    const contact: WaContactRow = {
      phone,
      firstName: first?.slice(0, 80) ?? null,
      lastName: last?.slice(0, 80) ?? null,
      email: email && /@/.test(email) ? email.toLowerCase().slice(0, 200) : null,
      company: cell(r, at("company_name"))?.slice(0, 200) ?? null,
      externalId: cell(r, at("user_id"))?.slice(0, 120) ?? null,
      location: location?.slice(0, 200) ?? null,
      tags: waTags(cell(r, at("tags")) ?? ""),
      vars,
      consent: consentAt >= 0 ? readYesNo(cell(r, consentAt)) === true : null,
    };
    const seen = byPhone.get(phone);
    if (seen !== undefined) {
      out.duplicates++;
      out.contacts[seen] = contact;
      return;
    }
    if (out.contacts.length >= WA_IMPORT.maxRows) return void out.overLimit++;
    byPhone.set(phone, out.contacts.length);
    out.contacts.push(contact);
  });
  return out;
}

export const SAMPLE_WA_CSV =
  "Name,Phone,Email,User ID,Tags,WhatsApp Opted,Appointment Time,Location\n" +
  'Priya Sharma,919820144120,priya.s@gmail.com,USR-10241,"VIP,Sarees",yes,2026-10-12 11:00,"Mumbai, Maharashtra"\n' +
  'Omar Haddad,+971501234567,omar@gulftraders.ae,USR-10242,dubai,yes,,"Dubai, UAE"\n' +
  "Rahul Verma,9930021877,,USR-10243,,no,,Delhi\n";

/** How a stored number is shown: "+971501234567". */
export const formatPhone = (digits: string) => `+${digits}`;

/** A stored number for reading: "+91 98201 44120", "+971 50 123 4567". */
export function prettyPhone(digits: string): string {
  const cc = [...new Set(DIAL_CODES.map((d) => d.dial))].sort((a, b) => b.length - a.length).find((d) => digits.startsWith(d) && digits.length - d.length >= 7);
  if (!cc) return `+${digits}`;
  const l = digits.slice(cc.length);
  const parts = l.length === 10 && cc === "91" ? [l.slice(0, 5), l.slice(5)] : l.length === 10 ? [l.slice(0, 3), l.slice(3, 6), l.slice(6)] : l.length === 9 ? [l.slice(0, 2), l.slice(2, 5), l.slice(5)] : [l.slice(0, 3), l.slice(3, 6), l.slice(6)].filter(Boolean);
  return `+${cc} ${parts.join(" ")}`;
}
