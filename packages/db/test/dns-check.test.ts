import { describe, expect, it } from "vitest";
import { checkDomainDns, type DnsLookup } from "../src/dns-check.js";

const fake = (txt: Record<string, string[]>, mx: Record<string, string[]> = {}): DnsLookup => ({
  txt: async (n) => txt[n] ?? [],
  mx: async (n) => mx[n] ?? [],
});
const now = new Date("2026-11-01T10:00:00Z");

describe("checkDomainDns", () => {
  it("passes a well set-up Hostinger domain", async () => {
    const r = await checkDomainDns(
      "TryCrawlers.pro",
      "HOSTINGER",
      fake(
        {
          "trycrawlers.pro": ["v=spf1 include:_spf.mail.hostinger.com ~all", "google-site-verification=x"],
          "hostingermail-a._domainkey.trycrawlers.pro": ["v=DKIM1;p="], // revoked: doesn't count
          "hostingermail-b._domainkey.trycrawlers.pro": ["v=DKIM1;k=rsa;p=MIGf"],
          "_dmarc.trycrawlers.pro": ["v=DMARC1; p=quarantine; rua=mailto:a@trycrawlers.pro"],
        },
        { "trycrawlers.pro": ["mx1.hostinger.com", "mx2.hostinger.com"] },
      ),
      now,
    );
    expect(r.domain).toBe("trycrawlers.pro");
    expect([r.mx.status, r.spf.status, r.dkim.status, r.dmarc.status]).toEqual(["ok", "ok", "ok", "ok"]);
    expect(r.dkim.detail).toContain("hostingermail-b");
    expect(r.checkedAt).toBe(now.toISOString());
  });

  it("explains what's missing, with fixes", async () => {
    const r = await checkDomainDns("example.com", "HOSTINGER", fake({}), now);
    expect(r.mx.status).toBe("missing");
    expect(r.spf).toMatchObject({ status: "missing" });
    expect(r.spf.fix).toContain("include:_spf.mail.hostinger.com");
    expect(r.dkim.status).toBe("missing");
    expect(r.dkim.fix).toContain("hPanel");
    expect(r.dmarc.fix).toContain("_dmarc.example.com");
  });

  it("warns on two SPF records, +all, or a missing host include", async () => {
    const two = await checkDomainDns("a.com", "GOOGLE", fake({ "a.com": ["v=spf1 include:_spf.google.com ~all", "v=spf1 -all"] }), now);
    expect(two.spf.status).toBe("warn");
    const all = await checkDomainDns("a.com", "GOOGLE", fake({ "a.com": ["v=spf1 include:_spf.google.com +all"] }), now);
    expect(all.spf.detail).toContain("+all");
    const other = await checkDomainDns("a.com", "GOOGLE", fake({ "a.com": ["v=spf1 include:_spf.mail.hostinger.com ~all"] }), now);
    expect(other.spf).toMatchObject({ status: "warn" });
    expect(other.spf.fix).toContain("_spf.google.com");
  });

  it("accepts p=none DMARC as a start", async () => {
    const r = await checkDomainDns("a.com", "OTHER", fake({ "_dmarc.a.com": ["v=DMARC1; p=none"] }), now);
    expect(r.dmarc.status).toBe("ok");
    expect(r.dmarc.detail).toContain("none");
  });

  it("never throws when DNS doesn't answer", async () => {
    const down: DnsLookup = { txt: () => Promise.reject(new Error("ETIMEOUT")), mx: () => Promise.reject(new Error("ETIMEOUT")) };
    const r = await checkDomainDns("a.com", "ZOHO", down, now);
    expect([r.mx.status, r.spf.status, r.dkim.status, r.dmarc.status]).toEqual(["warn", "warn", "warn", "warn"]);
  });
});
