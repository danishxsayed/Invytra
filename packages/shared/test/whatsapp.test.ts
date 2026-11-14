import { describe, expect, it } from "vitest";
import { checkTemplate, fillVariables, readMetaComponents, toMetaTemplate, waDailyLimit, waLimitLabel, waPhone, waTemplateName, waVariables, type WaTemplateDraft } from "../src/whatsapp";

const base: WaTemplateDraft = {
  name: "intro_offer",
  language: "en",
  category: "MARKETING",
  header: { type: "NONE" },
  body: "Hi {{1}}, we help teams at {{2}} book more meetings. Want a quick demo?",
  bodyExamples: ["Sara", "Acme"],
  footer: "Reply STOP to opt out",
  buttons: [{ type: "QUICK_REPLY", text: "Yes please" }],
};

describe("whatsapp templates", () => {
  it("names templates the way Meta wants", () => {
    expect(waTemplateName("  Follow-up Note #2 ")).toBe("follow_up_note_2");
    expect(waTemplateName("Café offer")).toBe("cafe_offer");
  });
  it("finds variables", () => {
    expect(waVariables("Hi {{1}} and {{ 2 }}")).toEqual([1, 2]);
    expect(fillVariables("Hi {{1}}, {{2}}", ["Sara"])).toBe("Hi Sara, {{2}}");
  });
  it("accepts a good template", () => expect(checkTemplate(base)).toEqual([]));
  it("catches what Meta rejects", () => {
    const bad = (p: Partial<WaTemplateDraft>) => checkTemplate({ ...base, ...p });
    expect(bad({ name: "Intro Offer" })[0]).toContain("lowercase");
    expect(bad({ body: "{{1}} hello there my good friend" , bodyExamples: ["x"]}).join()).toContain("start or end");
    expect(bad({ body: "Hi {{1}}, see {{3}} today friends", bodyExamples: ["a", "b", "c"] }).join()).toContain("in order");
    expect(bad({ bodyExamples: ["Sara"] }).join()).toContain("{{2}}");
    expect(bad({ body: "Hi {{1}} {{2}} ok", bodyExamples: ["a", "b"] }).join()).toContain("between two variables");
    expect(bad({ footer: "Bye {{1}}" }).join()).toContain("footer can't have variables");
    expect(bad({ header: { type: "TEXT", text: "Hi {{1}}" } }).join()).toContain("header's {{1}}");
    expect(bad({ header: { type: "IMAGE" } }).join()).toContain("Upload");
    expect(bad({ buttons: [{ type: "URL", text: "Site", url: "http://x.com" }] }).join()).toContain("https://");
    expect(bad({ buttons: [{ type: "URL", text: "Site", url: "https://x.com/{{1}}" }] }).join()).toContain("sample full link");
    expect(
      bad({ buttons: [{ type: "QUICK_REPLY", text: "A" }, { type: "URL", text: "B", url: "https://x.com" }, { type: "QUICK_REPLY", text: "C" }] }).join(),
    ).toContain("together");
  });
  it("builds Meta's shape and reads it back", () => {
    const meta = toMetaTemplate({ ...base, header: { type: "TEXT", text: "For {{1}}", example: "Sara" }, buttons: [{ type: "URL", text: "Book", url: "https://cal.com/{{1}}", example: "https://cal.com/sara" }] });
    expect(meta.components).toEqual([
      { type: "HEADER", format: "TEXT", text: "For {{1}}", example: { header_text: ["Sara"] } },
      { type: "BODY", text: base.body, example: { body_text: [["Sara", "Acme"]] } },
      { type: "FOOTER", text: "Reply STOP to opt out" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://cal.com/{{1}}", example: ["https://cal.com/sara"] }] },
    ]);
    const view = readMetaComponents(meta.components);
    expect(view).toMatchObject({ header: { type: "TEXT", text: "For {{1}}" }, body: base.body, footer: "Reply STOP to opt out", buttons: [{ type: "URL", text: "Book" }] });
    expect(readMetaComponents(null)).toEqual({ header: { type: "NONE" }, body: "", footer: "", buttons: [] });
  });
});

describe("whatsapp numbers", () => {
  it("reads limits", () => {
    expect(waDailyLimit("TIER_1K")).toBe(1000);
    expect(waDailyLimit("TIER_250")).toBe(250);
    expect(waLimitLabel("TIER_10K")).toBe("10K people / 24h");
    expect(waLimitLabel("TIER_UNLIMITED")).toBe("Unlimited");
    expect(waLimitLabel(null)).toBe("Not set yet");
  });
  it("cleans phone numbers", () => {
    expect(waPhone("+971 50 123 4567")).toBe("971501234567");
    expect(waPhone("0097150-1234567")).toBe("971501234567");
    expect(waPhone("12")).toBeNull();
  });
});
