import { describe, expect, it } from "vitest";
import { fillTemplate, missingVariables, outreachTextProblem } from "../src/index.js";

describe("outreachTextProblem", () => {
  it.each([
    "Hi {firstName}, …",
    "Hi {firstName}, ...",
    "Hi {firstName}, <your message>",
    "Hi {firstName}, I saw [company] is hiring",
    "Hi {first_name}, great to connect",
    "   ",
  ])("rejects %j", (t) => expect(outreachTextProblem(t)).not.toBeNull());

  it.each([
    "Hi {firstName}, I came across Haulnix and would love to connect.",
    "Hello {name} — quick question about your flooring business?",
    "Great post on pricing!",
  ])("accepts %j", (t) => expect(outreachTextProblem(t)).toBeNull());
});

describe("templates", () => {
  it("accepts every supported placeholder", () => {
    expect(outreachTextProblem("Hi {firstName} {lastName} of {company}, as {title} — {name}")).toBeNull();
  });
  it("fills from the lead list first, then the LinkedIn name", () => {
    expect(fillTemplate("Hi {firstName} at {company}", { firstName: "Jane", company: "Acme" }, "Janet Doe")).toBe("Hi Jane at Acme");
    expect(fillTemplate("Hi {firstName} {lastName} — {name}", {}, "Mary Ann Lee")).toBe("Hi Mary Ann Lee — Mary Ann Lee");
  });
  it("refuses to fill when a value is missing", () => {
    expect(fillTemplate("Hi {firstName} at {company}", { firstName: "Jane" }, "")).toBeNull();
    expect(fillTemplate("Hi {firstName}", {}, "")).toBeNull();
  });
  it("lists variables the lead can't fill", () => {
    expect(missingVariables("{firstName} at {company} as {title}", { company: "Acme" })).toEqual(["title"]);
  });
});
