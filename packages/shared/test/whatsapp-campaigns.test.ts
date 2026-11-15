import { describe, expect, it } from "vitest";
import { checkSources, previewBody, resolveSource, sendComponents, templateNeeds, waSendError } from "../src/index";

const comps = [
  { type: "HEADER", format: "TEXT", text: "For {{1}}" },
  { type: "BODY", text: "Hi {{1}}, a quick idea for {{2}}. Want details?" },
  { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes" }, { type: "URL", text: "Book", url: "https://cal.com/{{1}}" }] },
];
const c = { phone: "971501234567", firstName: null, lastName: null, profileName: "Omar H", company: "Gulf Traders", email: null, vars: { slug: "omar" } };

describe("whatsapp campaigns", () => {
  it("finds what a template needs", () => {
    expect(templateNeeds(comps)).toEqual({ slots: [{ slot: "header", label: "Header {{1}}" }, { slot: "body:1", label: "{{1}}" }, { slot: "body:2", label: "{{2}}" }, { slot: "button:1", label: "Link of “Book”" }], media: null });
    expect(templateNeeds([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hello there" }])).toEqual({ slots: [], media: "IMAGE" });
  });
  it("fills values with fallbacks", () => {
    expect(resolveSource({ kind: "field", field: "first_name", fallback: "there" }, c)).toBe("Omar");
    expect(resolveSource({ kind: "field", field: "email", fallback: "you" }, c)).toBe("you");
    expect(resolveSource({ kind: "custom", key: "slug", fallback: "x" }, c)).toBe("omar");
    expect(resolveSource({ kind: "text", value: " Dubai " }, c)).toBe("Dubai");
  });
  it("checks and builds the message", () => {
    const needs = templateNeeds(comps);
    const map = { header: { kind: "field" as const, field: "company" as const, fallback: "you" }, "body:1": { kind: "field" as const, field: "first_name" as const, fallback: "there" }, "body:2": { kind: "field" as const, field: "company" as const, fallback: "your team" } };
    expect(checkSources(needs, map, "")).toEqual(["Choose what goes into Link of “Book”."]);
    const full = { ...map, "button:1": { kind: "custom" as const, key: "slug", fallback: "" } };
    expect(checkSources(needs, full, "")[0]).toContain("fallback");
    expect(sendComponents(needs, full, c, "")).toEqual([
      { type: "header", parameters: [{ type: "text", text: "Gulf Traders" }] },
      { type: "body", parameters: [{ type: "text", text: "Omar" }, { type: "text", text: "Gulf Traders" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "omar" }] },
    ]);
    expect(previewBody("Hi {{1}} at {{2}}", full, c)).toBe("Hi Omar at Gulf Traders");
    expect(sendComponents(templateNeeds([{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi" }]), {}, c, "https://x.com/a.jpg")).toEqual([{ type: "header", parameters: [{ type: "image", image: { link: "https://x.com/a.jpg" } }] }]);
  });
  it("sends the offer code of a copy-code button", () => {
    const needs = templateNeeds([{ type: "BODY", text: "Hi, 30% off today." }, { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Shop" }, { type: "COPY_CODE", example: ["NAV30"] }] }]);
    expect(needs.coupons).toEqual([{ index: 1, code: "NAV30" }]);
    expect(sendComponents(needs, {}, c, "")).toEqual([{ type: "button", sub_type: "copy_code", index: "1", parameters: [{ type: "coupon_code", coupon_code: "NAV30" }] }]);
  });
  it("explains send errors", () => {
    expect(waSendError(131026, "x")).toContain("Not on WhatsApp");
    expect(waSendError(999, "Something")).toBe("Something");
  });
});
