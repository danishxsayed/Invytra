import { describe, expect, it } from "vitest";
import { builtInVar, emailTemplateVars, renderEmailText, unknownVars, varKey } from "../src/email-vars.js";

const r = { email: "priya@acme.io", firstName: "Priya", company: "Acme", website: "acme.io", vars: { city: "Pune", pain_point: "slow winters" } };

describe("email variables", () => {
  it("fills {{double}} and {single} forms, with loose names", () => {
    expect(renderEmailText("Hi {{first_name}} at {{Company Name}} ({{website}}), {firstName} in {city}: {{Pain Point}}", r)).toEqual({ ok: true, text: "Hi Priya at Acme (acme.io), Priya in Pune: slow winters" });
  });
  it("uses fallbacks, picks random options, and refuses empty variables", () => {
    expect(renderEmailText("{{random: Hi|Hello}} {{last_name | there}}", r, () => 0.9)).toEqual({ ok: true, text: "Hello there" });
    expect(renderEmailText("Hi {{last_name}}, {{job_title}}", r)).toEqual({ ok: false, missing: ["last_name", "job_title"] });
  });
  it("leaves {{unsubscribe}} for the sender", () => {
    expect(renderEmailText("Bye {{unsubscribe}}", r)).toEqual({ ok: true, text: "Bye {{unsubscribe}}" });
  });
  it("lists and checks the variables a text uses", () => {
    expect(emailTemplateVars("{{first_name|there}} {random:a|b} {{city}}")).toEqual(["first_name", "city"]);
    expect(unknownVars([{ subject: "{{firstName}}", body: "{{city}} {{industry|x}} {{unsubscribe}}" }], ["city"])).toEqual(["industry"]);
  });
  it("names variables", () => {
    expect(varKey("Pain Point")).toBe("pain_point");
    expect(varKey("companyWebsite")).toBe("company_website");
    expect(builtInVar("Company")).toBe("company_name");
    expect(builtInVar("Job Title")).toBe("job_title");
    expect(builtInVar("City")).toBeUndefined();
  });
});
