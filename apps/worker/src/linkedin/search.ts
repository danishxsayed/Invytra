import { cleanPersonName, parseDegree, RESULTS_PER_PAGE, splitName, type Degree, type SearchKind } from "@invytra/shared";
import type { SessionTaskContext } from "../browser/types.js";
import { humanPause } from "./human.js";
import { SEARCH_MARKERS, SELECTORS } from "./selectors.js";
import type { ActionOutcome } from "./actions.js";

export interface FoundPerson {
  /** /in/<name>/ for LinkedIn search; /in/<member id>/ for Sales Navigator (LinkedIn redirects it). */
  profileUrl: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  /** Connection degree shown in the results (1, 2, 3 = 3rd+), if shown. */
  degree?: Degree | null;
  /** Premium badge shown next to the name. */
  premium?: boolean;
  /** Their profile photo link, when shown. */
  photoUrl?: string | null;
}

export interface SearchPageResult {
  people: FoundPerson[];
  /** Whether another results page follows. */
  hasNext: boolean;
}

async function mentions(ctx: SessionTaskContext, markers: readonly string[]): Promise<boolean> {
  const text = (await ctx.page.evaluate(() => document.body?.innerText ?? "")).toLowerCase();
  return markers.some((m) => text.includes(m));
}

/** "Founder at Acme" → company "Acme". */
export function companyFromHeadline(headline: string | null): string | null {
  const m = /\s(?:at|@)\s+(.+?)(?:\s+[|·•]\s+.*)?$/i.exec(headline ?? "");
  return m ? m[1]!.trim() || null : null;
}

/**
 * Reads ONE page of a search into people. Opens the page like a person would,
 * scrolls through it (Sales Navigator only loads results as you scroll), and
 * reads names, headlines and locations.
 */
export async function readSearchPage(ctx: SessionTaskContext, url: string, kind: SearchKind): Promise<ActionOutcome<SearchPageResult>> {
  const { page } = ctx;
  // Same path and filters on the site this worker talks to (LinkedIn, or the test site in development).
  const target = new URL(url);
  await page.goto(new URL(target.pathname + target.search, ctx.baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await humanPause(page, 1500, 2500);
  await ctx.assertHealthy();

  const sales = kind !== "LINKEDIN_SEARCH";
  if (sales && (!new URL(page.url()).pathname.startsWith("/sales/") || (await mentions(ctx, SEARCH_MARKERS.noSalesNav)))) {
    return { outcome: "SKIPPED", reason: "NO_SALES_NAV" };
  }
  if (await mentions(ctx, SEARCH_MARKERS.searchLimit)) return { outcome: "SKIPPED", reason: "SEARCH_LIMIT" };

  // Scroll down through the results until no new ones appear (Sales Navigator loads them as you
  // scroll; a LinkedIn search page has them all at once, so it stops after a glance).
  const linkSel = sales ? SELECTORS.search.salesLeadLink : SELECTORS.search.profileLink;
  const enough = RESULTS_PER_PAGE[kind];
  let last = -1;
  for (let i = 0; i < 12; i++) {
    const n = await page.locator(linkSel).count();
    if ((n === last && i > 0) || (!sales && n >= enough && i > 0)) break;
    last = n;
    await page.evaluate((sel) => {
      const boxes = sel.split(",").map((s) => document.querySelector(s.trim())).filter(Boolean) as HTMLElement[];
      const box = boxes.find((b) => b.scrollHeight > b.clientHeight + 10);
      if (box) box.scrollBy(0, box.clientHeight * 0.8);
      window.scrollBy(0, window.innerHeight * 0.8);
    }, SELECTORS.search.salesScroller);
    await humanPause(page, 500, 1100);
  }

  const raw = sales ? await readSales(ctx) : await readLinkedIn(ctx);
  const seen = new Set<string>();
  const people: FoundPerson[] = [];
  for (const r of raw) {
    const name = cleanPersonName(r.name);
    if (!r.path || !name || SELECTORS.search.hiddenMember.test(name)) continue;
    // Stored like every lead: on linkedin.com (whatever site the worker is talking to).
    const profileUrl = new URL(r.path, "https://www.linkedin.com").toString();
    if (seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    const [firstName, lastName] = splitName(name);
    people.push({
      profileUrl,
      firstName,
      lastName,
      title: r.title || null,
      company: r.company || companyFromHeadline(r.title) || null,
      location: r.location || null,
      degree: parseDegree(r.name) ?? r.degreeLines.map(parseDegree).find((d) => d !== null) ?? null,
      premium: r.premium,
    });
  }

  if (people.length === 0) return { outcome: "DONE", data: { people, hasNext: false } };
  const next = page.getByRole("button", { name: SELECTORS.search.nextButton }).filter({ visible: true }).first();
  let hasNext: boolean;
  if ((await next.count()) > 0) hasNext = await next.isEnabled();
  else hasNext = people.length >= RESULTS_PER_PAGE[kind] * 0.8; // no pager found: a full page probably has more
  return { outcome: "DONE", data: { people, hasNext } };
}

interface RawResult {
  path: string;
  name: string;
  title: string;
  company: string;
  location: string;
  /** Short lines of the result that may hold the degree ("• 2nd", "3rd"). */
  degreeLines: string[];
  premium: boolean;
}

/** LinkedIn people search. No named helper functions inside evaluate (tsx adds a __name helper the page lacks). */
async function readLinkedIn(ctx: SessionTaskContext): Promise<RawResult[]> {
  return ctx.page.locator(SELECTORS.search.profileLink).evaluateAll(
    (links, sel) => {
      const out: { path: string; name: string; title: string; company: string; location: string; degreeLines: string[]; premium: boolean }[] = [];
      const done = new Set<string>();
      for (const a of links as HTMLAnchorElement[]) {
        const m = /\/in\/([^/?#]+)/.exec(a.getAttribute("href") ?? "");
        if (!m) continue;
        const path = `/in/${m[1]}/`;
        if (done.has(path)) continue;
        const nameEl = a.querySelector(sel.linkName);
        const name = ((nameEl?.textContent ?? a.innerText ?? "").split("\n")[0] ?? "").replace(/\s+/g, " ").trim();
        if (!name || /^view .*profile/i.test(name)) continue;
        done.add(path);
        const box = a.closest(sel.result) as HTMLElement | null;
        const lines = ((box?.innerText ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean));
        const rest = lines.slice(Math.max(0, lines.indexOf(name)) + 1).filter(
          (l) => l !== name && !/^[•·]?\s*(1st|2nd|3rd\+?)$/i.test(l) && !/degree connection/i.test(l) && !/^view .*profile/i.test(l) &&
            !/^(connect|message|follow|pending)$/i.test(l) && !/mutual connection|followers$/i.test(l) && l !== "•" && l !== "·",
        );
        const degreeLines = lines;
        const premium = !!box?.querySelector(sel.premium);
        out.push({ path, name, title: rest[0] ?? "", company: "", location: rest[1] ?? "", degreeLines, premium });
      }
      return out;
    },
    { linkName: SELECTORS.search.linkName, result: SELECTORS.search.result, premium: SELECTORS.profile.premiumBadge },
  );
}

/** Sales Navigator search or lead list. */
async function readSales(ctx: SessionTaskContext): Promise<RawResult[]> {
  return ctx.page.locator(SELECTORS.search.salesLeadLink).evaluateAll(
    (links, sel) => {
      const out: { path: string; name: string; title: string; company: string; location: string; degreeLines: string[]; premium: boolean }[] = [];
      const done = new Set<string>();
      for (const a of links as HTMLAnchorElement[]) {
        const m = /\/sales\/lead\/([^,/?#]+)/.exec(a.getAttribute("href") ?? "");
        if (!m) continue;
        const path = `/in/${m[1]}/`;
        if (done.has(path)) continue;
        const box = (a.closest("li") ?? a.closest("tr") ?? a.parentElement) as HTMLElement | null;
        const pick = (s: string) => ((box?.querySelector(s)?.textContent ?? "").replace(/\s+/g, " ").trim());
        const name = pick(sel.name) || (a.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!name) continue;
        done.add(path);
        const degreeLines = (box?.innerText ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
        const premium = !!box?.querySelector(sel.premium);
        out.push({ path, name, title: pick(sel.title), company: pick(sel.company), location: pick(sel.location), degreeLines, premium });
      }
      return out;
    },
    {
      name: SELECTORS.search.salesName,
      title: SELECTORS.search.salesTitle,
      company: SELECTORS.search.salesCompany,
      location: SELECTORS.search.salesLocation,
      premium: SELECTORS.profile.premiumBadge,
    },
  );
}
