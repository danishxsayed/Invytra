import { describe, expect, it } from "vitest";
import { SAMPLE_CONTACTS_CSV, applyMapping, contactsFromCsv, detectMapping, mappingProblem, readCsv } from "../src/email-contacts.js";

describe("contacts from a CSV", () => {
  it("detects the columns and reads the sample file", () => {
    const r = contactsFromCsv(SAMPLE_CONTACTS_CSV);
    expect(r.mapping).toEqual(["email", "first_name", "last_name", "company_name", "website", "job_title", "custom:city"]);
    expect(r.contacts[0]).toEqual({ email: "john@example.com", firstName: "John", lastName: "Smith", company: "Acme Inc.", title: "Founder", website: "acme.com", vars: { city: "Austin" } });
    expect(r.customKeys).toEqual(["city"]);
  });

  it("reports invalid rows and repeats with their row numbers", () => {
    const r = contactsFromCsv("Email,Name\nA@x.co,Ann Lee\nnot-an-email,Bob\n,Nobody\na@x.co,Again");
    expect(r.contacts.map((c) => [c.email, c.firstName, c.lastName])).toEqual([["a@x.co", "Ann", "Lee"]]);
    expect(r.invalid).toEqual([
      { row: 3, value: "not-an-email", reason: "Not a valid email address" },
      { row: 4, value: ", Nobody", reason: "No email address" },
    ]);
    expect(r.duplicates).toEqual([{ row: 5, email: "a@x.co" }]);
  });

  it("follows a changed mapping, and checks it", () => {
    const t = readCsv("Contact,Org,Notes\nann@z.co,Zeta,likes golf");
    expect(detectMapping(t)).toEqual(["email", "custom:org", "custom:notes"]);
    const r = applyMapping(t, ["email", "company_name", "skip"]);
    expect(r.contacts[0]).toMatchObject({ company: "Zeta", vars: {} });
    expect(mappingProblem(["skip", "company_name", "skip"])).toBe("Choose which column holds the email address.");
    expect(mappingProblem(["email", "company_name", "company_name"])).toBe("Two columns are mapped to the same field.");
  });

  it("reads a plain list of addresses without a header", () => {
    const r = contactsFromCsv("a@x.com\nb@y.org");
    expect(r.table.hasHeader).toBe(false);
    expect(r.contacts.map((c) => c.email)).toEqual(["a@x.com", "b@y.org"]);
  });
});
