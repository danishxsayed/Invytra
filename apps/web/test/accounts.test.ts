import { describe, expect, it } from "vitest";
import { explainStatus, isValidTimeZone, problemOf, proxySchema } from "../src/lib/accounts";

describe("plain-language account status", () => {
  it("maps worker reason codes, ignoring the screenshot path", () => {
    expect(problemOf("CHECKPOINT — screenshot: /srv/.data/x.png")).toBe("CHECKPOINT");
    expect(problemOf("CAPTCHA")).toBe("CAPTCHA");
    expect(problemOf("RESTRICTED")).toBe("RESTRICTED");
    expect(problemOf("NO_SESSION")).toBe("LOGGED_OUT");
    expect(problemOf("LOGGED_OUT — screenshot: /a.png")).toBe("LOGGED_OUT");
    expect(problemOf("Not logged in yet — run: pnpm account:login test-1")).toBe("NOT_CONNECTED");
    expect(problemOf(null)).toBeNull();
  });

  it("never shows a server file path to the customer", () => {
    const e = explainStatus("NEEDS_ATTENTION", "CHECKPOINT — screenshot: /srv/.data/x.png", true);
    expect(`${e.title} ${e.body}`).not.toContain("/srv");
    expect(e.next).toBe("reconnect");
  });

  it("offers the right next step", () => {
    expect(explainStatus("ACTIVE", null, true).next).toBe("none");
    expect(explainStatus("PAUSED", "Paused from the dashboard", true).next).toBe("resume");
    expect(explainStatus("DISCONNECTED", null, false).next).toBe("connect");
    expect(explainStatus("NEEDS_ATTENTION", "NO_SESSION", false).next).toBe("connect");
    expect(explainStatus("NEEDS_ATTENTION", "RESTRICTED", true).next).toBe("none");
  });
});

describe("account inputs", () => {
  it("accepts real proxy URLs only", () => {
    expect(proxySchema.safeParse("http://u:p@1.2.3.4:8000").success).toBe(true);
    expect(proxySchema.safeParse("socks5://host.example:1080").success).toBe(true);
    expect(proxySchema.safeParse("").success).toBe(true);
    expect(proxySchema.safeParse("1.2.3.4:8000").success).toBe(false);
    expect(proxySchema.safeParse("ftp://h:21").success).toBe(false);
    expect(proxySchema.safeParse("http://host-without-port").success).toBe(false);
  });
  it("checks time zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});
