import { describe, expect, it } from "vitest";
import { applyPhoneMapping, detectPhoneMapping, dncMatcher, fieldColumns, isOptOut, parseDncLine, phoneMappingProblem, phoneTable, readPhoneCsv, readYesNo, setFieldColumn, toCsv, waTag, waTags, withCountry } from "../src/index";

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
    expect(m).toEqual(["phone", "full_name", "tags", "location"]);
    expect(phoneMappingProblem(m)).toBeNull();
    const r = applyPhoneMapping(t, m, "971");
    expect(r.contacts.map((c) => c.phone)).toEqual(["971501234567", "919876543210"]);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual([{ row: 4, value: "hello", reason: "Not a valid number" }]);
    // The same number twice: the last row wins.
    expect(r.contacts[0]).toMatchObject({ firstName: "Omar", lastName: "again", tags: [], vars: { location: "Dubai" }, consent: null });
  });
  it("reads user IDs, consent, country codes, appointments and moves fields between columns", () => {
    const t = phoneTable([
      ["Name", "Phone", "Code", "User ID", "WhatsApp Opted", "Appointment Time", "Notes"],
      ["Priya Sharma", "9820144120", "", "USR-1", "yes", "2026-10-12 11:00", "likes red"],
      ["Omar", "501234567", "971", "USR-2", "no", "", ""],
      ["", "", "", "", "", "", ""],
    ]);
    expect(t.rows).toHaveLength(2);
    let m = detectPhoneMapping(t);
    expect(m).toEqual(["full_name", "phone", "custom:code", "user_id", "consent", "appointment", "custom:notes"]);
    expect(fieldColumns(m)).toMatchObject({ phone: 1, user_id: 3, country_code: -1, location: -1 });
    m = setFieldColumn(t, m, "country_code", 2);
    expect(m[2]).toBe("country_code");
    const r = applyPhoneMapping(t, m, "91");
    expect(r.contacts.map((c) => [c.phone, c.externalId, c.consent])).toEqual([["919820144120", "USR-1", true], ["971501234567", "USR-2", false]]);
    expect(r.contacts[0]!.vars).toEqual({ appointment_time: "2026-10-12 11:00", notes: "likes red" });
    // Pointing a field at nothing frees its column (it becomes a variable again).
    expect(setFieldColumn(t, m, "user_id", -1)[3]).toBe("custom:user_id");
    expect(readYesNo("TRUE")).toBe(true);
    expect(readYesNo("maybe")).toBeNull();
    expect(toCsv([["a,b", 'say "hi"'], ["x", ""]])).toBe('"a,b","say ""hi"""\nx,');
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
