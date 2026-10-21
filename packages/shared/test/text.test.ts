import { describe, expect, it } from "vitest";
import { outreachTextProblem } from "../src/index.js";

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
