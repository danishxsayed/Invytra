/**
 * LinkedIn profile links come in many shapes: with or without https/www,
 * country subdomains (in.linkedin.com), the mobile site, tracking query
 * strings, trailing slashes, upper-case or percent-encoded names. Everything
 * is reduced to one canonical form so the same person is always the same URL:
 *   https://www.linkedin.com/in/<lower-case slug>/
 */

export type ProfileUrlResult = { ok: true; url: string; slug: string } | { ok: false; reason: string };

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
const MEMBER_ID = /^AC[ow]AA[A-Za-z0-9_-]{10,}$/;

/** A profile link built from a member id (as Sales Navigator gives), not a profile name. */
export function isMemberIdUrl(url: string): boolean {
  const m = /\/in\/([^/?#]+)/.exec(url);
  return !!m && MEMBER_ID.test(decodeURIComponent(m[1]!));
}

export function parseProfileUrl(input: string, baseUrl = "https://www.linkedin.com"): ProfileUrlResult {
  let raw = input.trim().replace(/^[<"'(]+|[>"')]+$/g, "");
  if (!raw) return { ok: false, reason: "Empty" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid link" };
  }
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    /* ignore */
  }
  if (!LINKEDIN_HOST.test(url.hostname) && url.host !== baseHost) return { ok: false, reason: "Not a LinkedIn link" };
  if (/^\/sales\//i.test(url.pathname)) return { ok: false, reason: "Sales Navigator link. Use the person's regular profile link (/in/…)" };
  const m = /^\/in\/([^/?#]+)/i.exec(url.pathname);
  if (!m) return { ok: false, reason: "Not a profile link (expected linkedin.com/in/…)" };
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]!);
  } catch {
    slug = m[1]!;
  }
  slug = slug.trim();
  // Member ids (ACoAA…, and Sales Navigator's ACwAA…) are case-sensitive; LinkedIn redirects
  // them to the person's profile. Ordinary profile names are not, so they're lower-cased.
  if (!MEMBER_ID.test(slug)) slug = slug.toLowerCase();
  if (!slug || slug.length > 200) return { ok: false, reason: "Not a profile link (expected linkedin.com/in/…)" };
  const canonical = new URL(`/in/${encodeURIComponent(slug)}/`, baseUrl).toString();
  return { ok: true, url: canonical, slug };
}

/** Canonical URL, or null if the input isn't a LinkedIn profile link. */
export function canonicalProfileUrl(input: string, baseUrl?: string): string | null {
  const r = parseProfileUrl(input, baseUrl);
  return r.ok ? r.url : null;
}
