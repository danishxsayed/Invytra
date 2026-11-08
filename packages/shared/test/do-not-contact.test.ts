import { describe, expect, it } from "vitest";
import { companyKey, dncMatcher, linkedinSlug, parseDncLine, parseDncText } from "../src/index.js";

describe("do-not-contact list", () => {
  it("recognises what each line is", () => {
    expect(parseDncLine("https://www.linkedin.com/in/Jane-Doe-123/?trk=x")).toEqual({ kind: "LINKEDIN", value: "jane-doe-123" });
    expect(parseDncLine("linkedin.com/in/bob")).toEqual({ kind: "LINKEDIN", value: "bob" });
    expect(parseDncLine("Jane@Acme.com")).toEqual({ kind: "EMAIL", value: "jane@acme.com" });
    expect(parseDncLine("@acme.com")).toEqual({ kind: "DOMAIN", value: "acme.com" });
    expect(parseDncLine("https://www.acme.co.uk/about")).toEqual({ kind: "DOMAIN", value: "acme.co.uk" });
    expect(parseDncLine("Acme, Inc.")).toEqual({ kind: "COMPANY", value: "acme" });
    expect(parseDncLine("  ")).toBeNull();
    expect(parseDncLine("!")).toBeNull();
    const t = parseDncText("acme.com\nAcme Inc, acme.com\n!!\nGlobex Pvt Ltd");
    expect(t.entries).toEqual([{ kind: "DOMAIN", value: "acme.com" }, { kind: "COMPANY", value: "acme" }, { kind: "COMPANY", value: "globex" }]);
    expect(t.unreadable).toEqual(["!!"]);
  });

  it("matches people by profile, email, domain (and subdomains) and company", () => {
    const m = dncMatcher([
      { kind: "LINKEDIN", value: "jane-doe" },
      { kind: "EMAIL", value: "bob@x.io" },
      { kind: "DOMAIN", value: "acme.com" },
      { kind: "COMPANY", value: companyKey("Globex Corporation") },
    ]);
    expect(m({ profileUrl: "https://www.linkedin.com/in/jane-doe/" })?.kind).toBe("LINKEDIN");
    expect(m({ email: "BOB@x.io" })?.kind).toBe("EMAIL");
    expect(m({ email: "sam@mail.acme.com" })).toEqual({ kind: "DOMAIN", value: "acme.com" });
    expect(m({ email: "sam@notacme.com" })).toBeNull();
    expect(m({ company: "GLOBEX corp." })?.kind).toBe("COMPANY");
    expect(m({ company: "Globex Labs" })).toBeNull();
    expect(m({ profileUrl: "https://www.linkedin.com/in/someone-else/", email: "a@b.co", company: "Initech" })).toBeNull();
    expect(linkedinSlug("https://example.com")).toBeNull();
  });
});
