import { describe, expect, it } from "vitest";
import { snippetBody } from "../src/linkedin/inbox.js";

describe("inbox snippet text", () => {
  it("drops the sender prefix: You, first name, part of the name or the full name", () => {
    expect(snippetBody("Carol White", "Carol: Sure")).toBe("Sure");
    expect(snippetBody("Carol White", "You: Great")).toBe("Great");
    expect(snippetBody("Mohammed Tahur Sayed", "Mohammed Tahur: Hi Danish")).toBe("Hi Danish");
    expect(snippetBody("Mohammed Tahur Sayed", "Mohammed Tahur Sayed: Hi")).toBe("Hi");
  });
  it("keeps text that only looks like a prefix", () => {
    expect(snippetBody("Carol White", "Note: this matters")).toBe("Note: this matters");
    expect(snippetBody("Mohammed Tahur Sayed", "Moh: hi")).toBe("Moh: hi");
  });
});
