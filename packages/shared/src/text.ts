/** Placeholders the templates understand. */
export const TEMPLATE_TOKENS = ["firstName", "name"] as const;

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
  const unknown = [...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!).filter((k) => !(TEMPLATE_TOKENS as readonly string[]).includes(k));
  if (unknown.length) return `contains unknown placeholder {${unknown[0]}} — only {firstName} and {name} are filled in`;
  return null;
}
