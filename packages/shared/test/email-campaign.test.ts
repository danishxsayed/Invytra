import { describe, expect, it } from "vitest";
import { emailLeadsFromCsv, emailSequenceSchema, renderEmailText, unknownVars, varName } from "../src/email-campaign.js";

describe("email leads from CSV", () => {
  it("finds the columns, keeps the rest as variables, skips bad and repeated addresses", () => {
    const csv = "Email,First Name,Last Name,Company Name,Job Title,Company Website,City\n" +
      "Priya@Acme.io,Priya,Shah,Acme,CTO,acme.io,Pune\n" +
      "not-an-email,X,Y,Z,,,\n" +
      "priya@acme.io,Again,,,,,\n" +
      "sam@beta.com,Sam,,Beta,,,";
    const r = emailLeadsFromCsv(csv);
    expect(r.emailColumn).toBe("Email");
    expect(r.columns).toEqual(["companyWebsite", "city"]);
    expect(r.leads).toEqual([
      { email: "priya@acme.io", firstName: "Priya", lastName: "Shah", company: "Acme", title: "CTO", vars: { companyWebsite: "acme.io", city: "Pune" } },
      { email: "sam@beta.com", firstName: "Sam", lastName: null, company: "Beta", title: null, vars: {} },
    ]);
    expect(r.invalid).toEqual([{ row: 3, value: "not-an-email" }]);
    expect(r.duplicates).toBe(1);
  });

  it("splits a full name and reads a plain list of addresses", () => {
    expect(emailLeadsFromCsv("name;work email\nRavi Kumar;ravi@x.in").leads[0]).toMatchObject({ firstName: "Ravi", lastName: "Kumar", email: "ravi@x.in" });
    const list = emailLeadsFromCsv("a@x.com\nb@y.org\n");
    expect(list.leads.map((l) => l.email)).toEqual(["a@x.com", "b@y.org"]);
  });

  it("finds the email column by its contents when the header is unusual", () => {
    expect(emailLeadsFromCsv("Contact,Who\nann@z.co,Ann").emailColumn).toBe("Contact");
  });

  it("names variables from headers", () => {
    expect(varName("Company Website")).toBe("companyWebsite");
    expect(varName("  pain_point ")).toBe("painPoint");
  });
});

describe("writing an email for a lead", () => {
  const lead = { email: "priya@acme.io", firstName: "Priya", company: "Acme", vars: { city: "Pune" } };
  it("fills variables, fallbacks and random choices", () => {
    expect(renderEmailText("{random:Hi|Hello} {firstName}, how is {city}? {title|Your team} at {company}", lead, () => 0.9)).toEqual({ ok: true, text: "Hello Priya, how is Pune? Your team at Acme" });
  });
  it("refuses to send with an empty variable and no fallback", () => {
    expect(renderEmailText("Hi {lastName}, {title}", lead)).toEqual({ ok: false, missing: ["lastName", "title"] });
  });
  it("flags unknown variables", () => {
    expect(unknownVars([{ subject: "{firstName}", body: "{city} {painPoint|x} {random:a|b}", delayDays: 0 }], ["city"])).toEqual(["painPoint"]);
  });
});

describe("email sequence", () => {
  it("needs a first subject, text in each email, and a day between emails", () => {
    expect(emailSequenceSchema.safeParse([{ subject: "Hi", body: "x", delayDays: 0 }, { subject: "", body: "y", delayDays: 2 }]).success).toBe(true);
    const bad = emailSequenceSchema.safeParse([{ subject: "", body: " ", delayDays: 0 }, { subject: "", body: "y", delayDays: 0 }]);
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.message)).toEqual(["The first email needs a subject.", "Email 1 has no text.", "Email 2: wait at least 1 day after the previous email."]);
  });
});
