import { z } from "zod";

/*
 * Ask Invy: find businesses from a sentence ("50 restaurants in Bangalore without a website").
 * The AI turns the sentence into criteria; these rules decide, from real evidence only, whether
 * each business found matches. Claims carry where they came from (the Google listing, or what
 * Invytra saw on the business's own website) so verified facts and Invy's opinions stay apart.
 */

/** Most businesses one search returns (credits: 1 per business shown). */
export const INVY_MAX_COUNT = 100;
export const INVY_DEFAULT_COUNT = 20;
export const INVY_MESSAGE_MAX = 500;

export const INVY_NEEDS = ["outdated_site", "no_booking", "no_ordering", "not_mobile", "poor_presence", "few_reviews"] as const;
export type InvyNeed = (typeof INVY_NEEDS)[number];

export const invyCriteriaSchema = z.object({
  /** What kind of business ("restaurants", "dental clinics"). */
  category: z.string().trim().min(1).max(80),
  /** Where ("Bangalore", "Dubai, UAE"). */
  location: z.string().trim().min(1).max(120),
  count: z.number().int().min(1).max(INVY_MAX_COUNT),
  /** none: no official website; has: has one; any: doesn't matter. */
  website: z.enum(["none", "has", "any"]),
  needs: z.array(z.enum(INVY_NEEDS)).max(6),
  minRating: z.number().min(0).max(5).nullable().optional(),
  /** Google search phrases to run (the AI adds areas of the city to find more). */
  queries: z.array(z.string().trim().min(3).max(150)).min(1).max(8),
  /** What the user could offer them ("website development"), for the opportunity line. */
  offer: z.string().trim().max(120).nullable().optional(),
});
export type InvyCriteria = z.infer<typeof invyCriteriaSchema>;

export const SOCIAL_NETWORKS = ["instagram", "facebook", "linkedin", "x", "youtube", "whatsapp"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export type SocialLink = { network: SocialNetwork; url: string };

/** A profile link's network, or null for anything else (and for share / login links). */
export function socialNetworkOf(url: string): SocialNetwork | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase().replace(/^(www|m|mobile|web|business|in|[a-z]{2}-[a-z]{2})\./, "");
  const path = u.pathname.toLowerCase();
  if (/sharer|share|intent|dialog|login|plugins|\/tr$|home\.php/.test(path) || path === "/" || path === "") {
    if (!(h === "wa.me" && path.length > 1)) return null;
  }
  if (h === "instagram.com") return "instagram";
  if (h === "facebook.com" || h === "fb.com" || h === "fb.me") return "facebook";
  if (h === "linkedin.com" && /^\/(company|in|school)\//.test(path)) return "linkedin";
  if (h === "x.com" || h === "twitter.com") return "x";
  if (h === "youtube.com" || h === "youtu.be") return /^\/(watch|embed)/.test(path) ? null : "youtube";
  if (h === "wa.me" || h === "api.whatsapp.com" || h === "wa.link") return "whatsapp";
  return null;
}

/** What Invytra saw when it opened the business's website. */
export interface SiteCheck {
  /** none: no website on the listing; social: only a social/marketplace page; broken: didn't load; ok: loaded. */
  status: "none" | "social" | "broken" | "ok";
  url?: string;
  finalUrl?: string;
  httpStatus?: number;
  error?: string;
  https?: boolean;
  mobileFriendly?: boolean;
  copyrightYear?: number;
  generator?: string;
  /** Booking / ordering found on the homepage, and how ("Practo widget", "Book now link"). */
  booking?: string | null;
  ordering?: string | null;
  emails?: string[];
  /** The business's own social profiles linked from its website (or its listing's social page). */
  socials?: SocialLink[];
  title?: string;
  checkedAt: string;
}

/** A business as found on Google, with what Invytra checked. */
export interface InvyCandidate {
  name: string;
  category?: string | null;
  rating?: number | null;
  reviews?: number | null;
  website?: string | null;
  phone?: string | null;
  businessStatus?: string | null;
  check?: SiteCheck | null;
}

/** One reason, with where it comes from: listing = Google's listing, site = the website itself. */
export interface InvyReason {
  text: string;
  source: "listing" | "site";
}

export interface InvyMatch {
  match: boolean;
  reasons: InvyReason[];
  /** Why it was left out (for the counts). */
  miss?: string;
}

const SOCIAL = /(^|\.)(facebook|fb|instagram|linktr|linktree|twitter|x|youtube|wa|whatsapp|zomato|swiggy|justdial|practo|tripadvisor|google|business\.site|sites\.google|g\.page|maps\.app\.goo)\./i;

/** A listed "website" that's really a social or marketplace page, not the business's own site. */
export function isSocialUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return SOCIAL.test(`.${h}`) || h.endsWith(".business.site");
  } catch {
    return false;
  }
}

/** The years a copyright line can be from to count as recent. */
const OLD_AFTER = 3;

/** Whether this business matches the criteria, from evidence only; and why. */
export function matchBusiness(c: InvyCandidate, k: Pick<InvyCriteria, "website" | "needs" | "minRating">, now = new Date()): InvyMatch {
  const reasons: InvyReason[] = [];
  const s = c.check;
  if (c.businessStatus && c.businessStatus !== "OPERATIONAL") return { match: false, reasons, miss: "not operating" };
  if (k.minRating != null && (c.rating ?? 0) < k.minRating) return { match: false, reasons, miss: "rating too low" };

  const hasSite = !!s && (s.status === "ok" || s.status === "broken");
  if (k.website === "none") {
    if (!s || hasSite) return { match: false, reasons, miss: "has a website" };
    reasons.push(
      s.status === "social"
        ? { text: `Its Google listing links only to a social or marketplace page (${host(s.url)}), not its own website.`, source: "listing" }
        : { text: "No website on its Google Business listing.", source: "listing" },
    );
  }
  if (k.website === "has" && !hasSite) return { match: false, reasons, miss: "no website" };
  if (s?.status === "broken") reasons.push({ text: `Its listed website didn't load when checked (${s.error ?? `HTTP ${s.httpStatus}`}).`, source: "site" });

  const year = now.getUTCFullYear();
  for (const need of k.needs) {
    if (need === "outdated_site") {
      if (s?.status !== "ok") return { match: false, reasons, miss: "no website to judge" };
      const signs: string[] = [];
      if (s.copyrightYear && s.copyrightYear <= year - OLD_AFTER) signs.push(`copyright ${s.copyrightYear}`);
      if (s.mobileFriendly === false) signs.push("not set up for phones");
      if (s.https === false) signs.push("no HTTPS");
      if (signs.length < 2 && !(s.copyrightYear && s.copyrightYear <= year - 5)) return { match: false, reasons, miss: "website looks current" };
      reasons.push({ text: `Website looks outdated: ${signs.join(", ")}.`, source: "site" });
    }
    if (need === "not_mobile") {
      if (s?.status !== "ok" || s.mobileFriendly !== false) return { match: false, reasons, miss: "mobile-friendly" };
      reasons.push({ text: "Website isn't set up for phones (no mobile viewport).", source: "site" });
    }
    if (need === "no_booking") {
      if (s?.status === "ok" && s.booking) return { match: false, reasons, miss: "has online booking" };
      reasons.push(
        s?.status === "ok"
          ? { text: "No online booking found on its homepage.", source: "site" }
          : { text: "No website, so no online booking of its own.", source: "listing" },
      );
    }
    if (need === "no_ordering") {
      if (s?.status === "ok" && s.ordering) return { match: false, reasons, miss: "has online ordering" };
      reasons.push(
        s?.status === "ok"
          ? { text: "No online ordering found on its homepage.", source: "site" }
          : { text: "No website, so no direct online ordering.", source: "listing" },
      );
    }
    if (need === "few_reviews" || need === "poor_presence") {
      const few = (c.reviews ?? 0) < 25;
      const weak = need === "poor_presence" ? few || !hasSite || s?.mobileFriendly === false : few;
      if (!weak) return { match: false, reasons, miss: "strong online presence" };
      const bits: string[] = [];
      if (few) bits.push(`${c.reviews ?? 0} Google review${c.reviews === 1 ? "" : "s"}`);
      if (need === "poor_presence" && !hasSite && k.website !== "none") bits.push("no website");
      if (need === "poor_presence" && s?.mobileFriendly === false) bits.push("website not set up for phones");
      reasons.push({ text: `Limited online presence: ${bits.join(", ")}.`, source: bits.some((b) => b.startsWith("website")) ? "site" : "listing" });
    }
  }
  return { match: true, reasons };
}

const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "a page";
  } catch {
    return "a page";
  }
};

/** The default opportunity, when the AI hasn't written one. */
export function defaultOpportunity(k: Pick<InvyCriteria, "website" | "needs" | "offer">): string {
  if (k.offer) return k.offer;
  if (k.website === "none") return "Website development";
  if (k.needs.includes("no_booking")) return "Online booking system";
  if (k.needs.includes("no_ordering")) return "Online ordering";
  if (k.needs.includes("outdated_site") || k.needs.includes("not_mobile")) return "Website redesign";
  if (k.needs.includes("poor_presence") || k.needs.includes("few_reviews")) return "Digital marketing and reviews";
  return "Digital services";
}

/** A short title for a search ("Restaurants in Bangalore without a website"). */
export function invyTitle(k: Pick<InvyCriteria, "category" | "location" | "website" | "needs">): string {
  const what = k.category.charAt(0).toUpperCase() + k.category.slice(1);
  const extra =
    k.website === "none"
      ? " without a website"
      : k.needs.includes("outdated_site")
        ? " with outdated websites"
        : k.needs.includes("no_booking")
          ? " without online booking"
          : k.needs.includes("poor_presence")
            ? " with weak online presence"
            : "";
  return `${what} in ${k.location}${extra}`.slice(0, 120);
}

export const INVY_EXAMPLES = [
  "Find 20 restaurants in Bangalore without a website",
  "Find 15 dental clinics in Mumbai with no online booking",
  "Find IT companies in Dubai with outdated websites",
  "Find real estate agencies in Bangalore with weak online presence",
  "Find 10 salons in Pune that only have an Instagram page",
] as const;
