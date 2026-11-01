import { parseCsv, splitName } from "./leads.js";
import { BUILT_IN_VARS, builtInVar, varKey, type BuiltInVar } from "./email-vars.js";

/*
 * Email contacts from a CSV: find the columns, let the person map each column to a contact
 * field or a custom variable (or skip it), then validate rows: email syntax, repeats.
 * Runs in the browser (preview) and on the server (the import), with the same rules.
 */

export const CONTACT_IMPORT = { maxRows: 20_000, maxBytes: 5_000_000 } as const;

/** What a CSV column becomes. */
export type ColumnTarget = "skip" | "email" | Exclude<BuiltInVar, "email"> | `custom:${string}`;

export const FIELD_LABEL: Record<Exclude<ColumnTarget, `custom:${string}`>, string> = {
  skip: "Don't import",
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name (split into first and last)",
  company_name: "Company name",
  job_title: "Job title",
  website: "Website",
};

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
export const cleanEmail = (s: string) => s.trim().replace(/^mailto:/i, "").toLowerCase();

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** false: the first row was already data (a plain list of addresses). */
  hasHeader: boolean;
}

export function readCsv(text: string): CsvTable {
  const all = parseCsv(text);
  if (!all.length) return { headers: [], rows: [], hasHeader: true };
  const first = all[0]!;
  if (first.some((c) => isEmail(cleanEmail(c)))) {
    const width = Math.max(...all.slice(0, 50).map((r) => r.length));
    return { headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`), rows: all, hasHeader: false };
  }
  return { headers: first.map((h, i) => h.trim() || `Column ${i + 1}`), rows: all.slice(1), hasHeader: true };
}

/** A first guess of what each column is. */
export function detectMapping(t: CsvTable): ColumnTarget[] {
  const used = new Set<string>();
  const out: ColumnTarget[] = t.headers.map((h) => {
    const b = t.hasHeader ? builtInVar(h) : undefined;
    if (b && !used.has(b)) {
      used.add(b);
      return b as ColumnTarget;
    }
    const key = varKey(h);
    return t.hasHeader && key ? (`custom:${key}` as const) : "skip";
  });
  if (!out.includes("email")) {
    // No column named like an email: the first one whose cells hold addresses.
    const at = t.headers.findIndex((_, i) => t.rows.slice(0, 20).some((r) => isEmail(cleanEmail(r[i] ?? ""))));
    if (at >= 0) out[at] = "email";
  }
  return out;
}

export interface ContactRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  website: string | null;
  vars: Record<string, string>;
}

export interface ContactParse {
  contacts: ContactRow[];
  /** Rows without a valid address; row numbers as in the file (the header is row 1). */
  invalid: { row: number; value: string; reason: string }[];
  duplicates: { row: number; email: string }[];
  overLimit: number;
  /** Custom variable keys the mapping creates. */
  customKeys: string[];
}

export function mappingProblem(mapping: ColumnTarget[]): string | null {
  const emails = mapping.filter((m) => m === "email").length;
  if (emails === 0) return "Choose which column holds the email address.";
  if (emails > 1) return "Only one column can be the email address.";
  const fields = mapping.filter((m) => m !== "skip");
  if (new Set(fields).size !== fields.length) return "Two columns are mapped to the same field.";
  return null;
}

export function applyMapping(t: CsvTable, mapping: ColumnTarget[]): ContactParse {
  const at = (target: ColumnTarget) => mapping.indexOf(target);
  const emailAt = at("email");
  const custom = mapping.map((m, i) => ({ m, i })).filter((x): x is { m: `custom:${string}`; i: number } => x.m.startsWith("custom:"));
  const out: ContactParse = { contacts: [], invalid: [], duplicates: [], overLimit: 0, customKeys: [...new Set(custom.map((c) => c.m.slice(7)))] };
  if (emailAt < 0) return out;
  const seen = new Set<string>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
  t.rows.forEach((r, idx) => {
    const row = idx + (t.hasHeader ? 2 : 1);
    const raw = r[emailAt] ?? "";
    const email = cleanEmail(raw);
    if (!email) return out.invalid.push({ row, value: r.join(", ").slice(0, 80), reason: "No email address" }) && undefined;
    if (!isEmail(email)) return out.invalid.push({ row, value: raw.slice(0, 80), reason: "Not a valid email address" }) && undefined;
    if (seen.has(email)) return out.duplicates.push({ row, email }) && undefined;
    seen.add(email);
    if (out.contacts.length >= CONTACT_IMPORT.maxRows) return void out.overLimit++;
    let first = cell(r, at("first_name"));
    let last = cell(r, at("last_name"));
    if (!first && !last && at("full_name") >= 0) [first, last] = splitName(cell(r, at("full_name")));
    const vars: Record<string, string> = {};
    for (const c of custom) {
      const v = cell(r, c.i);
      if (v) vars[c.m.slice(7)] = v.slice(0, 1000);
    }
    out.contacts.push({ email, firstName: first, lastName: last, company: cell(r, at("company_name")), title: cell(r, at("job_title")), website: cell(r, at("website")), vars });
  });
  return out;
}

/** Shortcut: read, guess the mapping, apply it. */
export function contactsFromCsv(text: string): ContactParse & { mapping: ColumnTarget[]; table: CsvTable } {
  const table = readCsv(text);
  const mapping = detectMapping(table);
  return { ...applyMapping(table, mapping), mapping, table };
}

/** The sample file offered for download: the standard columns and one custom one. */
export const SAMPLE_CONTACTS_CSV =
  "Email,First Name,Last Name,Company Name,Website,Job Title,City\n" +
  "john@example.com,John,Smith,Acme Inc.,acme.com,Founder,Austin\n" +
  "sarah@example.com,Sarah,Wilson,Tech Solutions,techsolutions.io,Head of Marketing,London\n";

export const CONTACT_FIELDS = BUILT_IN_VARS;
