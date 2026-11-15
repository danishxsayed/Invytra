import { describe, expect, it } from "vitest";
import { describeSegment, newRule, segmentSchema, tagLabel } from "../src/index";

describe("whatsapp segments", () => {
  it("checks rules and describes them", () => {
    expect(segmentSchema.safeParse({ name: "VIP", rules: [newRule("tag", ["vip"])] }).success).toBe(true);
    expect(segmentSchema.safeParse({ name: "VIP", rules: [{ field: "tag", op: "has", value: "" }] }).success).toBe(false);
    expect(segmentSchema.safeParse({ name: "X", rules: [{ field: "added", op: "within", value: "abc" }] }).success).toBe(false);
    expect(segmentSchema.safeParse({ name: "X", rules: [{ field: "status", op: "is", value: "nope" }] }).success).toBe(false);
    expect(describeSegment({ match: "any", rules: [{ field: "tag", op: "has", value: "vip" }, { field: "added", op: "within", value: "30" }] })).toBe("Tag has vip or Added in the last 30 days");
    expect([tagLabel("abandoned-cart"), tagLabel("vip"), tagLabel("new"), tagLabel("order-issue")]).toEqual(["Abandoned cart", "VIP", "New", "Order issue"]);
  });
});
