import { describe, expect, it } from "vitest";
import { applyPhoneMapping, detectPhoneMapping, dncMatcher, isOptOut, parseDncLine, phoneMappingProblem, readPhoneCsv, waTag, waTags, withCountry } from "../src/index";

describe("whatsapp contacts", () => {
  it("recognises opt-outs, not ordinary replies", () => {
    for (const t of ["STOP", "Stop.", " unsubscribe 🙏", "إلغاء", "Opt out!", "remove me"]) expect(isOptOut(t)).toBe(true);
    for (const t of ["Please don't stop", "stop by tomorrow?", "", null, "yes"]) expect(isOptOut(t)).toBe(false);
  });
  it("cleans tags", () => {
    expect(waTag(" VIP Clients ")).toBe("vip-clients");
    expect(waTags("dubai, Warm ,dubai;new")).toEqual(["dubai", "warm", "new"]);
  });
  it("adds the default country code", () => {
    expect(withCountry("+971 50 123 4567", "91")).toBe("971501234567");
    expect(withCountry("050 123 4567", "971")).toBe("971501234567");
    expect(withCountry("501234567", "971")).toBe("971501234567");
    expect(withCountry("971501234567", "971")).toBe("971501234567");
    expect(withCountry("9876543210", "")).toBe("9876543210");
    expect(withCountry("abc", "971")).toBeNull();
  });
  it("reads a CSV: finds the columns, skips bad and repeated numbers", () => {
    const t = readPhoneCsv("Mobile,Name,Tags,City\n+971501234567,Omar Haddad,\"dubai,warm\",Dubai\n0501234567,Omar again,,Dubai\nhello,Bad,,\n+919876543210,Priya Shah,india,Mumbai\n");
    const m = detectPhoneMapping(t);
    expect(m).toEqual(["phone", "full_name", "tags", "custom:city"]);
    expect(phoneMappingProblem(m)).toBeNull();
    const r = applyPhoneMapping(t, m, "971");
    expect(r.contacts.map((c) => c.phone)).toEqual(["971501234567", "919876543210"]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([{ row: 4, value: "hello", reason: "Not a full number with country code" }]);
    expect(r.contacts[0]).toMatchObject({ firstName: "Omar", lastName: "Haddad", tags: ["dubai", "warm"], vars: { city: "Dubai" } });
  });
  it("reads a plain list of numbers without a header", () => {
    const t = readPhoneCsv("+971501234567\n+971501234568\n+971501234569\n");
    expect(t.hasHeader).toBe(false);
    expect(applyPhoneMapping(t, detectPhoneMapping(t)).contacts).toHaveLength(3);
  });
  it("puts phone numbers on the do-not-contact list", () => {
    expect(parseDncLine("+971 50 123 4567")).toEqual({ kind: "PHONE", value: "971501234567" });
    expect(parseDncLine("3M")).toEqual({ kind: "COMPANY", value: "3m" });
    expect(dncMatcher([{ kind: "PHONE", value: "971501234567" }])({ phone: "00971 50 123 4567" })).toEqual({ kind: "PHONE", value: "971501234567" });
  });
});
