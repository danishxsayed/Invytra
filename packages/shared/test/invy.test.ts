import { describe, expect, it } from "vitest";
import { defaultOpportunity, invyCriteriaSchema, invyTitle, isSocialUrl, matchBusiness, type SiteCheck } from "../src/invy";

const now = new Date("2026-11-10T00:00:00Z");
const ok = (x: Partial<SiteCheck> = {}): SiteCheck => ({ status: "ok", url: "https://abc.in", https: true, mobileFriendly: true, copyrightYear: 2026, checkedAt: "", ...x });
const k = (x: object = {}) => ({ website: "any" as const, needs: [] as never[], minRating: null, ...x });

describe("Ask Invy criteria", () => {
  it("validates what the AI returns", () => {
    expect(invyCriteriaSchema.safeParse({ category: "restaurants", location: "Bangalore", count: 50, website: "none", needs: [], queries: ["restaurants in Bangalore"] }).success).toBe(true);
    expect(invyCriteriaSchema.safeParse({ category: "x", location: "y", count: 500, website: "none", needs: [], queries: ["abc"] }).success).toBe(false);
    expect(invyCriteriaSchema.safeParse({ category: "x", location: "y", count: 5, website: "none", needs: ["fly"], queries: ["abc"] }).success).toBe(false);
  });

  it("titles and opportunities", () => {
    expect(invyTitle({ category: "restaurants", location: "Bangalore", website: "none", needs: [] })).toBe("Restaurants in Bangalore without a website");
    expect(invyTitle({ category: "dental clinics", location: "Mumbai", website: "any", needs: ["no_booking"] })).toBe("Dental clinics in Mumbai without online booking");
    expect(defaultOpportunity({ website: "none", needs: [], offer: null })).toBe("Website development");
    expect(defaultOpportunity({ website: "has", needs: ["outdated_site"], offer: null })).toBe("Website redesign");
    expect(defaultOpportunity({ website: "any", needs: [], offer: "Custom ERP software" })).toBe("Custom ERP software");
  });

  it("knows social and marketplace pages aren't websites", () => {
    expect(isSocialUrl("https://www.instagram.com/abc")).toBe(true);
    expect(isSocialUrl("https://www.zomato.com/bangalore/abc")).toBe(true);
    expect(isSocialUrl("https://abc-cafe.business.site/")).toBe(true);
    expect(isSocialUrl("https://abccafe.in")).toBe(false);
  });
});

describe("matching from evidence", () => {
  it("no website: only when the listing has none (or only a social page)", () => {
    expect(matchBusiness({ name: "A", check: { status: "none", checkedAt: "" } }, k({ website: "none" }), now)).toEqual({
      match: true,
      reasons: [{ text: "No website on its Google Business listing.", source: "listing" }],
    });
    const social = matchBusiness({ name: "A", check: { status: "social", url: "https://www.instagram.com/a", checkedAt: "" } }, k({ website: "none" }), now);
    expect(social.match).toBe(true);
    expect(social.reasons[0]!.text).toContain("instagram.com");
    expect(matchBusiness({ name: "A", check: ok() }, k({ website: "none" }), now)).toMatchObject({ match: false, miss: "has a website" });
    // Never claimed without a check.
    expect(matchBusiness({ name: "A", check: null }, k({ website: "none" }), now).match).toBe(false);
  });

  it("outdated: needs two signs, or a very old copyright", () => {
    expect(matchBusiness({ name: "A", check: ok({ copyrightYear: 2022 }) }, k({ needs: ["outdated_site"] }), now).match).toBe(false);
    const two = matchBusiness({ name: "A", check: ok({ copyrightYear: 2022, mobileFriendly: false }) }, k({ needs: ["outdated_site"] }), now);
    expect(two).toMatchObject({ match: true, reasons: [{ text: "Website looks outdated: copyright 2022, not set up for phones.", source: "site" }] });
    expect(matchBusiness({ name: "A", check: ok({ copyrightYear: 2019 }) }, k({ needs: ["outdated_site"] }), now).match).toBe(true);
    expect(matchBusiness({ name: "A", check: { status: "none", checkedAt: "" } }, k({ needs: ["outdated_site"] }), now).match).toBe(false);
  });

  it("no booking: from the homepage, or no website at all", () => {
    expect(matchBusiness({ name: "A", check: ok({ booking: "Practo widget" }) }, k({ needs: ["no_booking"] }), now).match).toBe(false);
    expect(matchBusiness({ name: "A", check: ok({ booking: null }) }, k({ needs: ["no_booking"] }), now).reasons).toEqual([{ text: "No online booking found on its homepage.", source: "site" }]);
    expect(matchBusiness({ name: "A", check: { status: "none", checkedAt: "" } }, k({ needs: ["no_booking"] }), now).match).toBe(true);
  });

  it("weak presence, rating floor, closed businesses", () => {
    expect(matchBusiness({ name: "A", reviews: 8, check: ok() }, k({ needs: ["poor_presence"] }), now).reasons[0]!.text).toBe("Limited online presence: 8 Google reviews.");
    expect(matchBusiness({ name: "A", reviews: 400, check: ok() }, k({ needs: ["poor_presence"] }), now).match).toBe(false);
    expect(matchBusiness({ name: "A", rating: 3.2, check: ok() }, k({ minRating: 4 }), now)).toMatchObject({ match: false, miss: "rating too low" });
    expect(matchBusiness({ name: "A", businessStatus: "CLOSED_PERMANENTLY", check: { status: "none", checkedAt: "" } }, k({ website: "none" }), now).match).toBe(false);
  });

  it("a website that doesn't load is noted, and still counts as having one", () => {
    const r = matchBusiness({ name: "A", check: { status: "broken", url: "https://a.in", error: "DNS not found", checkedAt: "" } }, k({ website: "has" }), now);
    expect(r).toEqual({ match: true, reasons: [{ text: "Its listed website didn't load when checked (DNS not found).", source: "site" }] });
  });
});
