/*
 * Email variables: {{first_name}}, {{company_name|your team}} (with a fallback),
 * {{random:Hi|Hello}} (one at random). The older single-brace form ({firstName}) still
 * works. Names match loosely: {{First Name}}, {{first_name}} and {firstName} are the same.
 */

export interface EmailRecipientVars {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  /** Custom variables by key (e.g. { city: "Pune", pain_point: "…" }). */
  vars?: Record<string, string>;
}
/** @deprecated old name */
export type EmailLeadVars = EmailRecipientVars;

/** The built-in variables, as the editor shows them. */
export const BUILT_IN_VARS = ["first_name", "last_name", "full_name", "company_name", "job_title", "website", "email"] as const;
export type BuiltInVar = (typeof BUILT_IN_VARS)[number];

/** Lower-case letters and digits only: how names are compared. */
export const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<BuiltInVar, string[]> = {
  first_name: ["firstname", "first", "fname", "givenname"],
  last_name: ["lastname", "last", "lname", "surname", "familyname"],
  full_name: ["fullname", "name", "contactname"],
  company_name: ["companyname", "company", "organization", "organisation", "employer", "accountname"],
  job_title: ["jobtitle", "title", "position", "role", "designation"],
  website: ["website", "companywebsite", "url", "domain", "site", "web"],
  email: ["email", "emailaddress", "mail"],
};
const BY_ALIAS = new Map<string, BuiltInVar>(Object.entries(ALIASES).flatMap(([k, list]) => list.map((a) => [a, k as BuiltInVar] as const)));

/** The built-in variable a name means, if any ("Company" → company_name). */
export const builtInVar = (name: string): BuiltInVar | undefined => BY_ALIAS.get(normKey(name));

/** A column or name as a custom variable key: "Pain Point" → pain_point. */
export function varKey(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function valueOf(r: EmailRecipientVars, name: string): string {
  switch (builtInVar(name)) {
    case "first_name":
      return r.firstName ?? "";
    case "last_name":
      return r.lastName ?? "";
    case "full_name":
      return [r.firstName, r.lastName].filter(Boolean).join(" ");
    case "company_name":
      return r.company ?? "";
    case "job_title":
      return r.title ?? "";
    case "website":
      return r.website ?? r.vars?.website ?? "";
    case "email":
      return r.email;
  }
  const n = normKey(name);
  for (const [k, v] of Object.entries(r.vars ?? {})) if (normKey(k) === n) return v;
  return "";
}

/** {{ … }} or { … }. */
const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}|\{([^{}]+)\}/g;
const isRandom = (inner: string) => /^random\s*:/i.test(inner);

/** The variable names a text uses (not random choices). */
export function emailTemplateVars(text: string): string[] {
  const names = [...text.matchAll(TOKEN)].map((m) => (m[1] ?? m[2])!).filter((t) => !isRandom(t)).map((t) => t.split("|")[0]!.trim());
  return [...new Set(names)];
}

/** Variables used that are neither built in nor among the known custom variables. */
export function unknownVars(texts: { subject: string; body: string }[], custom: readonly string[]): string[] {
  const known = new Set(custom.map(normKey));
  return [...new Set(texts.flatMap((s) => [...emailTemplateVars(s.subject), ...emailTemplateVars(s.body)]))].filter((v) => !builtInVar(v) && !known.has(normKey(v)) && normKey(v) !== "unsubscribe");
}

/**
 * Writes a text for one recipient. A variable with no value and no fallback means the
 * email can't be sent to them (never "Hi ,"): the missing names come back instead.
 * {{unsubscribe}} is left in place for the sender to fill.
 */
export function renderEmailText(text: string, r: EmailRecipientVars, rand: () => number = Math.random): { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const out = text.replace(TOKEN, (whole, a?: string, b?: string) => {
    const inner = (a ?? b)!;
    if (isRandom(inner)) {
      const options = inner.replace(/^random\s*:/i, "").split("|");
      return options[Math.floor(rand() * options.length)]!.trim();
    }
    const [name, ...fb] = inner.split("|");
    if (normKey(name!) === "unsubscribe") return whole;
    const v = valueOf(r, name!.trim()).trim();
    if (v) return v;
    if (fb.length) return fb.join("|").trim();
    missing.push(name!.trim());
    return "";
  });
  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true, text: out };
}
