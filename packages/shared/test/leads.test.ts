import { describe, expect, it } from "vitest";
import { canonicalProfileUrl, detectColumns, leadsFromCsv, leadsFromText, parseCsv, parseProfileUrl, LEAD_IMPORT } from "../src/index.js";

describe("profile URLs", () => {
  it.each([
    ["https://www.linkedin.com/in/Jane-Doe-123/", "https://www.linkedin.com/in/jane-doe-123/"],
    ["linkedin.com/in/jane-doe-123?trk=abc", "https://www.linkedin.com/in/jane-doe-123/"],
    ["http://in.linkedin.com/in/jane-doe-123/details/experience/", "https://www.linkedin.com/in/jane-doe-123/"],
    ["https://m.linkedin.com/in/jane-doe-123", "https://www.linkedin.com/in/jane-doe-123/"],
    ["<https://www.linkedin.com/in/jane>", "https://www.linkedin.com/in/jane/"],
    ["https://www.linkedin.com/in/J%C3%B6rg-M%C3%BCller", "https://www.linkedin.com/in/j%C3%B6rg-m%C3%BCller/"],
  ])("%s", (input, out) => expect(canonicalProfileUrl(input)).toBe(out));

  it("explains what is wrong", () => {
    expect(parseProfileUrl("https://www.linkedin.com/company/acme")).toMatchObject({ ok: false, reason: /profile link/ });
    expect(parseProfileUrl("https://www.linkedin.com/sales/lead/ACwAA,NAME")).toMatchObject({ ok: false, reason: /Sales Navigator/ });
    expect(parseProfileUrl("https://example.com/in/jane")).toMatchObject({ ok: false, reason: "Not a LinkedIn link" });
    expect(parseProfileUrl("not a url at all")).toMatchObject({ ok: false });
  });

  it("uses the base URL for the canonical form (test site)", () => {
    expect(canonicalProfileUrl("https://linkedin.com/in/alice", "http://127.0.0.1:7799")).toBe("http://127.0.0.1:7799/in/alice/");
  });
});

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿Name,Note\r\n"Doe, Jane","She said ""hi""\nline2"\r\n\r\nBob,x\n');
    expect(rows).toEqual([["Name", "Note"], ["Doe, Jane", 'She said "hi"\nline2'], ["Bob", "x"]]);
  });
  it("detects semicolons and tabs", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("column detection", () => {
  it("maps common export headers (Apollo / Sales Nav style)", () => {
    const m = detectColumns(["First Name", "Last Name", "Title", "Company Name", "Person Linkedin Url", "City"]);
    expect(m).toEqual({ url: 4, firstName: 0, lastName: 1, title: 2, company: 3, location: 5 });
  });
  it("finds the profile column by its contents when the header is unknown", () => {
    const m = detectColumns(["Who", "Link"], [["Jane", "https://linkedin.com/in/jane"]]);
    expect(m.url).toBe(1);
  });
  it("prefers a column that really holds profile links over a misleading header", () => {
    const m = detectColumns(["Website", "LI"], [["https://acme.com", "linkedin.com/in/jane"]]);
    expect(m.url).toBe(1);
  });
});

describe("leads from CSV", () => {
  const csv = [
    "Full Name,Company,LinkedIn URL,Phone",
    "Jane Doe,Acme,https://www.linkedin.com/in/jane-doe/,123",
    "Jane Again,Acme,linkedin.com/in/JANE-DOE?x=1,",
    "Bob,Beta,https://www.linkedin.com/company/beta,",
    "No Link,Gamma,,",
  ].join("\n");

  it("imports, dedupes, explains bad rows and keeps other columns", () => {
    const r = leadsFromCsv(csv);
    expect(r.leads).toEqual([
      {
        profileUrl: "https://www.linkedin.com/in/jane-doe/",
        firstName: "Jane",
        lastName: "Doe",
        company: "Acme",
        title: null,
        location: null,
        extra: { Phone: "123" },
      },
    ]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([
      { row: 4, value: "https://www.linkedin.com/company/beta", reason: expect.stringMatching(/profile link/) },
      { row: 5, value: "", reason: "No LinkedIn link" },
    ]);
    expect(r.headers).toEqual(["Full Name", "Company", "LinkedIn URL", "Phone"]);
  });

  it("accepts a mapping override", () => {
    const r = leadsFromCsv(csv, { url: 2, company: 0 });
    expect(r.leads[0]).toMatchObject({ company: "Jane Doe", firstName: null });
  });

  it("works without a header row", () => {
    const r = leadsFromCsv("https://linkedin.com/in/a\nhttps://linkedin.com/in/b");
    expect(r.leads.map((l) => l.profileUrl)).toEqual(["https://www.linkedin.com/in/a/", "https://www.linkedin.com/in/b/"]);
  });

  it("stops at the import limit", () => {
    const lines = Array.from({ length: LEAD_IMPORT.maxLeads + 5 }, (_, i) => `https://linkedin.com/in/p${i}`);
    const r = leadsFromCsv(lines.join("\n"));
    expect(r.leads).toHaveLength(LEAD_IMPORT.maxLeads);
    expect(r.overLimit).toBe(5);
  });
});

describe("leads from pasted text", () => {
  it("finds every link on every line", () => {
    const r = leadsFromText("Jane https://www.linkedin.com/in/jane, linkedin.com/in/bob\n\nhello\nhttps://linkedin.com/in/jane/");
    expect(r.leads.map((l) => l.profileUrl)).toEqual(["https://www.linkedin.com/in/jane/", "https://www.linkedin.com/in/bob/"]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([{ row: 3, value: "hello", reason: "No LinkedIn link" }]);
  });
});
