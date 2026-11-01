import { describe, expect, it } from "vitest";
import { fromServiceAnswer, millionVerifier, mxLookup, verifyEmail, type EmailVerifier } from "../src/verify.js";

const mx = async (d: string) => (d === "nomail.co" ? [] : d === "dnsdown.co" ? null : ["mx.example.com"]);
const svc = (result: string, extra: object = {}): EmailVerifier => ({ name: "Test", check: async () => ({ result: result as never, ...extra }) });

describe("email verification", () => {
  it("catches obvious problems for free, without the service", async () => {
    let called = 0;
    const spy: EmailVerifier = { name: "Spy", check: async () => (called++, { result: "ok" }) };
    expect(await verifyEmail("a@mailinator.com", { verifier: spy, mx })).toEqual({ status: "INVALID", detail: "Disposable (temporary) mailbox" });
    expect(await verifyEmail("a@nomail.co", { verifier: spy, mx })).toMatchObject({ status: "INVALID", detail: expect.stringContaining("can't receive") });
    expect(await verifyEmail("not-an-email", { verifier: spy, mx })).toMatchObject({ status: "INVALID" });
    expect(called).toBe(0);
  });

  it("never calls an address valid on the free checks alone", async () => {
    expect(await verifyEmail("a@fine.co", { verifier: null, mx })).toMatchObject({ status: "UNKNOWN" });
    expect(await verifyEmail("a@dnsdown.co", { verifier: svc("ok"), mx })).toMatchObject({ status: "VALID" });
  });

  it("looks up where a domain takes mail: MX, else A record; caches per batch", async () => {
    let calls = 0;
    const look = mxLookup({
      mx: async (d) => (calls++, d === "mx.co" ? ["mx1.mx.co"] : d === "down.co" ? Promise.reject(new Error("ETIMEOUT")) : []),
      a: async (d) => (d === "aonly.co" ? ["1.2.3.4"] : []),
    });
    expect(await look("mx.co")).toEqual(["mx1.mx.co"]);
    expect(await look("mx.co")).toEqual(["mx1.mx.co"]);
    expect(calls).toBe(1);
    expect(await look("aonly.co")).toEqual(["1.2.3.4"]);
    expect(await look("nothing.co")).toEqual([]);
    expect(await look("down.co")).toBeNull();
  });

  it("maps the service's answers", () => {
    expect(fromServiceAnswer({ result: "ok", role: true }, "MV")).toEqual({ status: "VALID", detail: "Mailbox exists · role address (e.g. info@)" });
    expect(fromServiceAnswer({ result: "catch_all" }, "MV")).toMatchObject({ status: "RISKY" });
    expect(fromServiceAnswer({ result: "invalid", didyoumean: "a@gmail.com" }, "MV")).toEqual({ status: "INVALID", detail: "Mailbox doesn't exist · did you mean a@gmail.com?" });
    expect(fromServiceAnswer({ result: "disposable" }, "MV")).toMatchObject({ status: "INVALID" });
    expect(fromServiceAnswer({ result: "unknown" }, "MV")).toMatchObject({ status: "UNKNOWN" });
    expect(fromServiceAnswer({ result: "error", error: "Insufficient credits" }, "MV")).toEqual({ retry: true, error: "Insufficient credits" });
  });

  it("calls MillionVerifier's API and reads its answer", async () => {
    let asked = "";
    const fake = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ email: "a@b.co", quality: "good", result: "catch_all", resultcode: 2, subresult: "", free: false, role: false, didyoumean: "", credits: 99, error: "" }));
    }) as unknown as typeof fetch;
    expect(await millionVerifier("k&1", fake).check("a+x@b.co")).toEqual({ result: "catch_all", role: false, didyoumean: undefined });
    expect(asked).toBe("https://api.millionverifier.com/api/v3/?api=k%261&email=a%2Bx%40b.co&timeout=20");
    const bad = (async () => new Response(JSON.stringify({ error: "Invalid API key", result: "" }))) as unknown as typeof fetch;
    expect(await millionVerifier("x", bad).check("a@b.co")).toEqual({ result: "error", error: "Invalid API key" });
  });
});
