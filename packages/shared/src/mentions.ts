/*
 * @mentions in WhatsApp inbox notes: "@Rohan can you hold one?" tells Rohan (by the bell).
 * A teammate is mentioned by their first name or their full name after "@", any case.
 */

export interface Mentionable {
  id: string;
  name: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const first = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** The teammates a note mentions (each once), never its author. */
export function mentionedIn(text: string, members: readonly Mentionable[], authorId?: string | null): string[] {
  const out: string[] = [];
  for (const m of members) {
    if (m.id === authorId) continue;
    const names = [...new Set([m.name.trim(), first(m.name)].filter((n) => n.length >= 2))];
    if (names.some((n) => new RegExp(`(^|[^\\w@])@${esc(n)}(?![\\w])`, "i").test(text))) out.push(m.id);
  }
  return out;
}

/** What's being typed after a trailing "@" (for the picker), or null. */
export function mentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(text);
  return m ? m[1]! : null;
}

/** Puts the picked teammate's first name in place of the trailing "@…". */
export function insertMention(text: string, name: string): string {
  return text.replace(/@([\p{L}\p{N}]*)$/u, `@${first(name)} `);
}
