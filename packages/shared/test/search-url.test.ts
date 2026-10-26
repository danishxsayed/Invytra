import { describe, expect, it } from "vitest";
import { cleanPersonName, isMemberIdUrl, parseProfileUrl, parseSearchUrl, searchPageUrl } from "../src/index.js";

describe("search links", () => {
  it("recognises LinkedIn people searches and drops the page number", () => {
    expect(parseSearchUrl("https://www.linkedin.com/search/results/people/?keywords=founder&geoUrn=%5B%22102713980%22%5D&page=3")).toEqual({
      ok: true,
      kind: "LINKEDIN_SEARCH",
      url: "https://www.linkedin.com/search/results/people/?keywords=founder&geoUrn=%5B%22102713980%22%5D",
    });
  });
  it("recognises Sales Navigator searches and lead lists", () => {
    expect(parseSearchUrl("linkedin.com/sales/search/people?query=(keywords%3Acto)&sessionId=x")).toMatchObject({ ok: true, kind: "SALES_NAV_SEARCH" });
    expect(parseSearchUrl("https://www.linkedin.com/sales/lists/people/7123456789?sortCriteria=CREATED_TIME")).toMatchObject({ ok: true, kind: "SALES_NAV_LIST" });
  });
  it("explains what's wrong with other links", () => {
    expect(parseSearchUrl("https://www.linkedin.com/search/results/all/?keywords=cto")).toMatchObject({ ok: false, reason: expect.stringMatching(/People/) });
    expect(parseSearchUrl("https://www.linkedin.com/sales/search/company?query=x")).toMatchObject({ ok: false });
    expect(parseSearchUrl("https://www.linkedin.com/in/jane/")).toMatchObject({ ok: false });
    expect(parseSearchUrl("https://example.com/search/results/people/")).toMatchObject({ ok: false });
  });
  it("builds page links", () => {
    expect(searchPageUrl("https://www.linkedin.com/search/results/people/?keywords=a", 2)).toBe("https://www.linkedin.com/search/results/people/?keywords=a&page=2");
    expect(searchPageUrl("https://www.linkedin.com/search/results/people/?keywords=a&page=4", 1)).toBe("https://www.linkedin.com/search/results/people/?keywords=a");
  });
});

describe("member-id profile links (from Sales Navigator)", () => {
  it("keeps the id's capital letters, but lower-cases ordinary names", () => {
    expect(parseProfileUrl("https://www.linkedin.com/in/ACwAAA1bCdEfGhIjK/")).toMatchObject({ url: "https://www.linkedin.com/in/ACwAAA1bCdEfGhIjK/" });
    expect(parseProfileUrl("https://www.linkedin.com/in/Jane-Doe/")).toMatchObject({ url: "https://www.linkedin.com/in/jane-doe/" });
    expect(isMemberIdUrl("https://www.linkedin.com/in/ACwAAA1bCdEfGhIjK/")).toBe(true);
    expect(isMemberIdUrl("https://www.linkedin.com/in/jane-doe/")).toBe(false);
  });
});

describe("names from search results", () => {
  it("drops credentials, pronouns and emojis", () => {
    expect(cleanPersonName("Jane Doe, MBA")).toBe("Jane Doe");
    expect(cleanPersonName("Raj Patel (He/Him) 🚀")).toBe("Raj Patel");
    expect(cleanPersonName("  Ana   María  ")).toBe("Ana María");
    expect(cleanPersonName("Kenny Stewart • 3rd+")).toBe("Kenny Stewart");
    expect(cleanPersonName("JD Flooring · 2nd")).toBe("JD Flooring");
    expect(cleanPersonName("Cristina and Peter Silaghi • 1st")).toBe("Cristina and Peter Silaghi");
  });
});
