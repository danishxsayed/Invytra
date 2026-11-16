import { describe, expect, it } from "vitest";
import { insertMention, mentionQuery, mentionedIn } from "../src/mentions";

const team = [
  { id: "a", name: "Arjun Mehta" },
  { id: "r", name: "Rohan Iyer" },
  { id: "s", name: "Sneha" },
];

describe("mentions", () => {
  it("finds teammates by first or full name after @, any case, once each", () => {
    expect(mentionedIn("@rohan can you hold one? @Rohan", team)).toEqual(["r"]);
    expect(mentionedIn("cc @Arjun Mehta and @sneha.", team)).toEqual(["a", "s"]);
  });
  it("ignores emails, partial names and the author", () => {
    expect(mentionedIn("mail rohan@shop.in", team)).toEqual([]);
    expect(mentionedIn("@Rohanx and @Ro", team)).toEqual([]);
    expect(mentionedIn("@Sneha @Rohan", team, "s")).toEqual(["r"]);
  });
  it("reads what's typed after @ and puts the picked name in", () => {
    expect(mentionQuery("can you @ro")).toBe("ro");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("mail me@x")).toBeNull();
    expect(mentionQuery("@ro done")).toBeNull();
    expect(insertMention("can you @ro", "Rohan Iyer")).toBe("can you @Rohan ");
  });
});
