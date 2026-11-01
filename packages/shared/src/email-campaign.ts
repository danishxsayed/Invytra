import { z } from "zod";
import { parseCsv, splitName } from "./leads.js";

/*
 * Email campaigns: leads from a CSV (an email column plus any other columns, which become
 * variables), a sequence of emails, and how each email is written for one lead.
 */

export const EMAIL_CAMPAIGN = {
  maxSteps: 8,
  maxDelayDays: 30,
  subjectMax: 200,
  bodyMax: 5000,
  maxLeadsPerImport: 10_000,
} as const;

// ---------------------------------------------------------------- sequence

export const emailStepSchema = z.object({
  /** Empty on a follow-up = a reply in the same thread ("Re: <first subject>"). */
  subject: z.string().max(EMAIL_CAMPAIGN.subjectMax).transform((s) => s.trim()),
  body: z.string().max(EMAIL_CAMPAIGN.bodyMax),
  /** Days after the previous email (the first email: 0 = as soon as sending allows). */
  delayDays: z.number().int().min(0).max(EMAIL_CAMPAIGN.maxDelayDays),
});
export type EmailStep = z.infer<typeof emailStepSchema>;

export const emailSequenceSchema = z
  .array(emailStepSchema)
  .min(1, "Add at least one email.")
  .max(EMAIL_CAMPAIGN.maxSteps, `At most ${EMAIL_CAMPAIGN.maxSteps} emails in a sequence.`)
  .superRefine((steps, ctx) => {
    steps.forEach((s, i) => {
      if (i === 0 && !s.subject) ctx.addIssue({ code: "custom", message: "The first email needs a subject.", path: [i, "subject"] });
      if (!s.body.trim()) ctx.addIssue({ code: "custom", message: `Email ${i + 1} has no text.`, path: [i, "body"] });
      if (i > 0 && s.delayDays < 1) ctx.addIssue({ code: "custom", message: `Email ${i + 1}: wait at least 1 day after the previous email.`, path: [i, "delayDays"] });
    });
  });

export const DEFAULT_EMAIL_SEQUENCE: EmailStep[] = [
  { subject: "Quick question, {firstName|there}", body: "{random:Hi|Hello} {firstName|there},\n\n", delayDays: 0 },
  { subject: "", body: "{random:Hi|Hey} {firstName|there}, just bringing this back to the top of your inbox.\n\n", delayDays: 3 },
];

// ---------------------------------------------------------------- variables

export const BUILT_IN_VARS = ["firstName", "lastName", "fullName", "company", "title", "email"] as const;

/** A column name as a variable: "Company Website" → companyWebsite. */
export function varName(header: string): string {
  const words = header.trim().replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join("");
}

export interface EmailLeadVars {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  /** Other CSV columns by variable name. */
  vars?: Record<string, string>;
}

function valueOf(lead: EmailLeadVars, name: string): string {
  switch (name) {
    case "firstName":
      return lead.firstName ?? "";
    case "lastName":
      return lead.lastName ?? "";
    case "fullName":
      return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
    case "company":
      return lead.company ?? "";
    case "title":
      return lead.title ?? "";
    case "email":
      return lead.email;
    default:
      return lead.vars?.[name] ?? "";
  }
}

const TOKEN = /\{([^{}]+)\}/g;

/** The variables a text uses (without random:… choices). */
export function emailTemplateVars(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((m) => m[1]!).filter((t) => !t.startsWith("random:")).map((t) => t.split("|")[0]!.trim()))];
}

/** Variables used that are neither built in nor columns of the imported leads. */
export function unknownVars(steps: EmailStep[], columns: readonly string[]): string[] {
  const known = new Set<string>([...BUILT_IN_VARS, ...columns]);
  return [...new Set(steps.flatMap((s) => [...emailTemplateVars(s.subject), ...emailTemplateVars(s.body)]))].filter((v) => !known.has(v));
}

/**
 * Writes a text for one lead: {var} (empty → can't send), {var|fallback}, and
 * {random:a|b|c} (one at random). Returns the text, or the variables with no value.
 */
export function renderEmailText(text: string, lead: EmailLeadVars, rand: () => number = Math.random): { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(TOKEN, (_, inner: string) => {
    if (inner.startsWith("random:")) {
      const options = inner.slice(7).split("|");
      return options[Math.floor(rand() * options.length)]!.trim();
    }
    const [name, ...fb] = inner.split("|");
    const v = valueOf(lead, name!.trim()).trim();
    if (v) return v;
    if (fb.length) return fb.join("|").trim();
    missing.push(name!.trim());
    return "";
  });
  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true, text: out };
}

// ---------------------------------------------------------------- leads from CSV

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

const k = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const COLS = {
  email: ["email", "emailaddress", "workemail", "businessemail", "mail", "email1", "contactemail", "personalemail"],
  firstName: ["firstname", "first", "givenname", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  fullName: ["fullname", "name", "contactname", "personname", "leadname"],
  company: ["company", "companyname", "organization", "organisation", "account", "accountname", "employer"],
  title: ["title", "jobtitle", "position", "role", "designation"],
} as const;

export interface EmailLeadRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  vars: Record<string, string>;
}

export interface EmailLeadParse {
  leads: EmailLeadRow[];
  /** Rows without a valid email address (row numbers count the header as row 1). */
  invalid: { row: number; value: string }[];
  duplicates: number;
  overLimit: number;
  /** Extra columns, as variable names. */
  columns: string[];
  /** Which column held the email (null = none found). */
  emailColumn: string | null;
}

/** Leads from a CSV (with headers) or a plain list of email addresses. */
export function emailLeadsFromCsv(text: string): EmailLeadParse {
  const rows = parseCsv(text);
  const empty: EmailLeadParse = { leads: [], invalid: [], duplicates: 0, overLimit: 0, columns: [], emailColumn: null };
  if (!rows.length) return empty;

  const header = rows[0]!;
  const headerHasEmail = header.some((h) => isEmail(h));
  let headers: string[];
  let data: string[][];
  if (headerHasEmail) {
    // No header row: a plain list (an email per line, maybe with more columns).
    headers = header.map((_, i) => (i === header.findIndex((h) => isEmail(h)) ? "email" : `column${i + 1}`));
    data = rows;
  } else {
    headers = header;
    data = rows.slice(1);
  }
  const find = (aliases: readonly string[]) => headers.findIndex((h) => (aliases as readonly string[]).includes(k(h)));
  let emailAt = find(COLS.email);
  if (emailAt < 0) emailAt = headers.findIndex((_, i) => data.slice(0, 20).some((r) => isEmail(r[i] ?? "")));
  if (emailAt < 0) return { ...empty, invalid: data.map((r, i) => ({ row: i + 2, value: r.join(", ").slice(0, 80) })) };

  const at = { first: find(COLS.firstName), last: find(COLS.lastName), full: find(COLS.fullName), company: find(COLS.company), title: find(COLS.title) };
  const used = new Set([emailAt, ...Object.values(at)].filter((i) => i >= 0));
  const extra = headers.map((h, i) => ({ i, name: varName(h) })).filter((c) => !used.has(c.i) && c.name && !(BUILT_IN_VARS as readonly string[]).includes(c.name));

  const out: EmailLeadParse = { ...empty, columns: extra.map((c) => c.name), emailColumn: headers[emailAt]! };
  const seen = new Set<string>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() || null : null);
  data.forEach((r, idx) => {
    const email = (r[emailAt] ?? "").trim().replace(/^mailto:/i, "").toLowerCase();
    if (!isEmail(email)) {
      out.invalid.push({ row: idx + (headerHasEmail ? 1 : 2), value: email || r.join(", ").slice(0, 80) });
      return;
    }
    if (seen.has(email)) {
      out.duplicates++;
      return;
    }
    seen.add(email);
    if (out.leads.length >= EMAIL_CAMPAIGN.maxLeadsPerImport) {
      out.overLimit++;
      return;
    }
    let first = cell(r, at.first);
    let last = cell(r, at.last);
    if (!first && !last && at.full >= 0) [first, last] = splitName(cell(r, at.full));
    const vars: Record<string, string> = {};
    for (const c of extra) {
      const v = cell(r, c.i);
      if (v) vars[c.name] = v;
    }
    out.leads.push({ email, firstName: first, lastName: last, company: cell(r, at.company), title: cell(r, at.title), vars });
  });
  return out;
}
