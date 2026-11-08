/*
 * The workspace's do-not-contact list: people (LinkedIn profile or email), whole email domains
 * and companies that no channel ever contacts. Entries are typed in freely (one per line) and
 * recognised here; every channel matches people against them with dncMatch().
 */

export const DNC_KINDS = ["LINKEDIN", "EMAIL", "DOMAIN", "COMPANY"] as const;
export type DncKind = (typeof DNC_KINDS)[number];
export const DNC_KIND_LABEL: Record<DncKind, string> = { LINKEDIN: "LinkedIn profile", EMAIL: "Email", DOMAIN: "Domain", COMPANY: "Company" };
export const DNC_MAX_PER_ADD = 2000;

export interface DncEntry {
  kind: DncKind;
  /** Normalised: slug, lowercased email/domain, or company key. */
  value: string;
}

/** The profile's slug ("jane-doe-123") from any LinkedIn profile link, or null. */
export function linkedinSlug(url: string | null | undefined): string | null {
  const m = /linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i.exec(url ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!).toLowerCase().replace(/\/+$/, "");
  } catch {
    return m[1]!.toLowerCase();
  }
}

const SUFFIX = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|pvt|private|plc|gmbh|co|corp|corporation|company|llp|sa|ag|bv|pty)\b\.?/g;

/** "Acme, Inc." / "ACME Pvt. Ltd" → "acme": how companies are compared. */
export function companyKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(SUFFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const cleanDomain = (d: string) => d.toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").trim();
const isDomain = (d: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);

/** What one typed line is: a LinkedIn profile, an email, a domain or a company. Null when empty/unusable. */
export function parseDncLine(raw: string): DncEntry | null {
  const line = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!line) return null;
  const slug = linkedinSlug(line);
  if (slug) return { kind: "LINKEDIN", value: slug };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) return { kind: "EMAIL", value: line.toLowerCase() };
  const d = cleanDomain(line);
  if (!/\s/.test(line) && isDomain(d)) return { kind: "DOMAIN", value: d };
  const key = companyKey(line);
  return key.length >= 2 ? { kind: "COMPANY", value: key } : null;
}

/** Many lines (or comma-separated), without repeats. */
export function parseDncText(text: string): { entries: DncEntry[]; unreadable: string[] } {
  const seen = new Set<string>();
  const entries: DncEntry[] = [];
  const unreadable: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    if (!raw.trim()) continue;
    const e = parseDncLine(raw);
    if (!e) {
      unreadable.push(raw.trim());
      continue;
    }
    const k = `${e.kind}:${e.value}`;
    if (!seen.has(k)) seen.add(k), entries.push(e);
  }
  return { entries, unreadable };
}

export interface DncPerson {
  profileUrl?: string | null;
  email?: string | null;
  company?: string | null;
}

/** A fast matcher over a workspace's list. */
export function dncMatcher(entries: DncEntry[]) {
  const by: Record<DncKind, Set<string>> = { LINKEDIN: new Set(), EMAIL: new Set(), DOMAIN: new Set(), COMPANY: new Set() };
  for (const e of entries) by[e.kind]?.add(e.value);
  /** The entry this person is blocked by, or null. */
  return (p: DncPerson): DncEntry | null => {
    const slug = linkedinSlug(p.profileUrl);
    if (slug && by.LINKEDIN.has(slug)) return { kind: "LINKEDIN", value: slug };
    const email = p.email?.trim().toLowerCase();
    if (email) {
      if (by.EMAIL.has(email)) return { kind: "EMAIL", value: email };
      // The domain and every parent domain (mail.acme.com is blocked by acme.com).
      const parts = email.slice(email.indexOf("@") + 1).split(".");
      for (let i = 0; i < parts.length - 1; i++) {
        const d = parts.slice(i).join(".");
        if (by.DOMAIN.has(d)) return { kind: "DOMAIN", value: d };
      }
    }
    const co = companyKey(p.company);
    if (co && by.COMPANY.has(co)) return { kind: "COMPANY", value: co };
    return null;
  };
}

/** The reason saved on a skipped lead. */
export const DNC_REASON = "On your do-not-contact list";
