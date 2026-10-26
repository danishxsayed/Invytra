/**
 * Search links people paste to collect leads: a LinkedIn people search, a Sales
 * Navigator lead search, or a Sales Navigator lead list. Everything else gets a
 * plain-words reason.
 */

export type SearchKind = "LINKEDIN_SEARCH" | "SALES_NAV_SEARCH" | "SALES_NAV_LIST";
export type SearchUrlResult = { ok: true; kind: SearchKind; url: string } | { ok: false; reason: string };

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  LINKEDIN_SEARCH: "LinkedIn search",
  SALES_NAV_SEARCH: "Sales Navigator search",
  SALES_NAV_LIST: "Sales Navigator lead list",
};

/** People per results page on each kind of search. */
export const RESULTS_PER_PAGE: Record<SearchKind, number> = { LINKEDIN_SEARCH: 10, SALES_NAV_SEARCH: 25, SALES_NAV_LIST: 25 };
/** LinkedIn shows at most 100 pages of people search; Sales Navigator at most 100 pages of 25. */
export const MAX_PAGES: Record<SearchKind, number> = { LINKEDIN_SEARCH: 100, SALES_NAV_SEARCH: 100, SALES_NAV_LIST: 100 };
export const IMPORT_MAX_LEADS = 2500;

export function parseSearchUrl(input: string, baseUrl = "https://www.linkedin.com"): SearchUrlResult {
  let raw = input.trim().replace(/^[<"'(]+|[>"')]+$/g, "");
  if (!raw) return { ok: false, reason: "Paste a search link." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That isn't a valid link." };
  }
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).host;
  } catch {
    /* ignore */
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname) && url.host !== baseHost) return { ok: false, reason: "That isn't a LinkedIn link." };
  const path = url.pathname.replace(/\/+$/, "");
  url.searchParams.delete("page");
  url.hash = "";
  const out = (kind: SearchKind): SearchUrlResult => ({ ok: true, kind, url: new URL(url.pathname + url.search, baseUrl).toString() });

  if (/^\/search\/results\/people$/i.test(path)) return out("LINKEDIN_SEARCH");
  if (/^\/search\/results\/(all|companies|content|groups|events|schools|services)$/i.test(path)) {
    return { ok: false, reason: "That search isn't filtered to people. On LinkedIn, click the “People” filter at the top of the results, then copy the link again." };
  }
  if (/^\/sales\/search\/people$/i.test(path)) return out("SALES_NAV_SEARCH");
  if (/^\/sales\/lists\/people\/[^/]+$/i.test(path)) return out("SALES_NAV_LIST");
  if (/^\/sales\/search\/company$/i.test(path) || /^\/sales\/lists\/company/i.test(path)) {
    return { ok: false, reason: "That's an account (company) search. Use a Sales Navigator lead search or lead list instead." };
  }
  if (/^\/talent\//i.test(path)) return { ok: false, reason: "LinkedIn Recruiter searches aren't supported yet." };
  if (/^\/in\//i.test(path)) return { ok: false, reason: "That's one person's profile. To add people one by one, paste their links in “Paste links”." };
  return { ok: false, reason: "Paste the link of a LinkedIn people search, a Sales Navigator lead search, or a Sales Navigator lead list." };
}

/** The link for one results page (1-based). */
export function searchPageUrl(url: string, page: number): string {
  const u = new URL(url);
  if (page > 1) u.searchParams.set("page", String(page));
  else u.searchParams.delete("page");
  return u.toString();
}

/**
 * Cleans a name as search results show it: drops emojis, credentials after a
 * comma ("Jane Doe, MBA") and bracketed extras ("Raj (He/Him)").
 */
export function cleanPersonName(raw: string): string {
  return raw
    // Connection degree LinkedIn prints after the name ("Kenny Stewart • 3rd+", "· 2nd")
    .replace(/\s*[•·]\s*(?:1st|2nd|3rd\+?)(?:\s+degree(?:\s+connection)?)?\s*$/i, "")
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/\s*[([].*?[)\]]\s*/g, " ")
    .split(/,\s/)[0]!
    .replace(/\s+/g, " ")
    .trim();
}
