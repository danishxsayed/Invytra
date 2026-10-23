/** Placeholders notes and messages can use. */
export const TEMPLATE_TOKENS = ["firstName", "lastName", "name", "company", "title"] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];
export type TemplateVars = Partial<Record<TemplateToken, string | null>>;

const TOKEN_LIST = "{firstName}, {lastName}, {name}, {company} and {title}";

/** The placeholders a text uses, e.g. ["firstName", "company"]. */
export function templateTokens(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!))];
}

/**
 * Catches notes/messages that still contain placeholder text — "…", "...",
 * "<your text>", "[company]" or an unknown {token} — before anything is sent.
 * Returns a human-readable problem, or null if the text looks ready to send.
 */
export function outreachTextProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return "is empty";
  if (/…|\.\.\./.test(t)) return 'contains "…" — replace the placeholder with your real text';
  if (/<[^<>]{1,40}>/.test(t)) return "contains a <placeholder> — replace it with your real text";
  if (/\[[^\[\]]{1,40}\]/.test(t)) return "contains a [placeholder] — replace it with your real text";
  const unknown = templateTokens(t).filter((k) => !(TEMPLATE_TOKENS as readonly string[]).includes(k));
  if (unknown.length) return `contains unknown placeholder {${unknown[0]}} — only ${TOKEN_LIST} are filled in`;
  return null;
}

/**
 * Fills placeholders. Names come from the lead list when present, otherwise
 * from the name LinkedIn shows on the profile (`profileName`).
 * Returns null if a placeholder has no value — never send "Hi ,".
 */
export function fillTemplate(text: string, vars: TemplateVars, profileName = ""): string | null {
  const full = profileName.trim().replace(/\s+/g, " ");
  const [pFirst = "", ...pRest] = full ? full.split(" ") : [];
  const value: Record<TemplateToken, string> = {
    firstName: (vars.firstName ?? "").trim() || pFirst,
    lastName: (vars.lastName ?? "").trim() || pRest.join(" "),
    name: full || [vars.firstName, vars.lastName].filter(Boolean).join(" ").trim(),
    company: (vars.company ?? "").trim(),
    title: (vars.title ?? "").trim(),
  };
  let missing = false;
  const out = text.replace(/\{(firstName|lastName|name|company|title)\}/g, (_, k: TemplateToken) => {
    if (!value[k]) missing = true;
    return value[k];
  });
  return missing ? null : out;
}

/** Placeholders this text needs that the lead's own details can't fill (names can come from LinkedIn). */
export function missingVariables(text: string, vars: TemplateVars): TemplateToken[] {
  return templateTokens(text).filter(
    (k): k is TemplateToken => (k === "company" || k === "title") && !(vars[k] ?? "").trim(),
  );
}
