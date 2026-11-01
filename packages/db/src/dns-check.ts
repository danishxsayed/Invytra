import { Resolver } from "node:dns/promises";
import type { MailboxProviderId } from "./mailbox.js";

/*
 * Domain health for cold email: the DNS records mail providers check before trusting a
 * sender (SPF, DKIM, DMARC) and that replies can arrive (MX). Read-only DNS lookups.
 */

export type DnsStatus = "ok" | "warn" | "missing";

export interface DnsItem {
  status: DnsStatus;
  /** What was found, in plain words. */
  detail: string;
  /** What to do when it isn't ok. */
  fix?: string;
}

export interface DomainDns {
  domain: string;
  checkedAt: string;
  mx: DnsItem;
  spf: DnsItem;
  dkim: DnsItem;
  dmarc: DnsItem;
}

export interface DnsLookup {
  txt(name: string): Promise<string[]>;
  mx(name: string): Promise<string[]>;
}

const NOT_FOUND = new Set(["ENOTFOUND", "ENODATA", "ENOTFOUND", "NXDOMAIN", "ESERVFAIL"]);

export function realDnsLookup(): DnsLookup {
  const r = new Resolver({ timeout: 5000, tries: 2 });
  const none = (e: unknown) => {
    if (NOT_FOUND.has((e as { code?: string })?.code ?? "")) return [] as string[];
    throw e;
  };
  return {
    txt: (n) => r.resolveTxt(n).then((rows) => rows.map((parts) => parts.join("")), none),
    mx: (n) => r.resolveMx(n).then((rows) => rows.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase()), none),
  };
}

/** What each host's SPF record should include, and where its DKIM key usually lives. */
const PROVIDER_DNS: Partial<Record<MailboxProviderId, { spf: string; spfLabel: string; dkimSelectors: string[]; where: string }>> = {
  GOOGLE: { spf: "_spf.google.com", spfLabel: "include:_spf.google.com", dkimSelectors: ["google"], where: "Google Admin → Apps → Gmail → Authenticate email" },
  MICROSOFT: { spf: "spf.protection.outlook.com", spfLabel: "include:spf.protection.outlook.com", dkimSelectors: ["selector1", "selector2"], where: "Microsoft Defender → Email authentication → DKIM" },
  ZOHO: { spf: "zoho.", spfLabel: "include:zoho.in (or zoho.com)", dkimSelectors: ["zmail", "zoho", "default"], where: "Zoho Mail Admin → Domains → Email configuration → DKIM" },
  HOSTINGER: { spf: "_spf.mail.hostinger.com", spfLabel: "include:_spf.mail.hostinger.com", dkimSelectors: ["hostingermail-a", "hostingermail-b", "hostingermail-c", "hostingermail1", "hostingermail2"], where: "hPanel → Emails → DNS settings" },
  GODADDY: { spf: "secureserver.net", spfLabel: "include:secureserver.net", dkimSelectors: ["default", "s1", "s2"], where: "GoDaddy → Email & Office → Email authentication" },
};
const COMMON_SELECTORS = ["default", "dkim", "mail", "k1", "s1", "s2", "selector1", "selector2", "google"];

/** Checks one domain's email DNS. Never throws: an unreachable DNS shows as "couldn't check". */
export async function checkDomainDns(domain: string, provider: MailboxProviderId, dns: DnsLookup = realDnsLookup(), now = new Date()): Promise<DomainDns> {
  const d = domain.toLowerCase();
  const p = PROVIDER_DNS[provider];
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const unreachable: DnsItem = { status: "warn", detail: "Couldn't check right now (DNS didn't answer)." };

  // MX: replies need somewhere to arrive.
  const mxHosts = await safe(() => dns.mx(d), null as string[] | null);
  const mx: DnsItem = !mxHosts
    ? unreachable
    : mxHosts.length
      ? { status: "ok", detail: `Mail goes to ${mxHosts.slice(0, 2).join(", ")}.` }
      : { status: "missing", detail: "No MX record: replies can't reach this domain.", fix: "Add the MX records your email host gives you." };

  // SPF: one record that allows the mail host to send.
  const txt = await safe(() => dns.txt(d), null as string[] | null);
  let spf: DnsItem;
  if (!txt) spf = unreachable;
  else {
    const records = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
    if (records.length === 0) spf = { status: "missing", detail: "No SPF record.", fix: `Add a TXT record on ${d}: v=spf1 ${p?.spfLabel ?? "include:<your email host>"} ~all` };
    else if (records.length > 1) spf = { status: "warn", detail: "More than one SPF record: receivers ignore all of them.", fix: "Merge them into a single v=spf1 record." };
    else {
      const r = records[0]!;
      if (/\+all\b/i.test(r)) spf = { status: "warn", detail: "SPF allows anyone to send (+all).", fix: "Change +all to ~all." };
      else if (p && !r.toLowerCase().includes(p.spf)) spf = { status: "warn", detail: `SPF doesn't include your email host.`, fix: `Add ${p.spfLabel} to your SPF record.` };
      else spf = { status: "ok", detail: r };
    }
  }

  // DKIM: a signing key under one of the host's usual selectors.
  const selectors = [...new Set([...(p?.dkimSelectors ?? []), ...COMMON_SELECTORS])];
  const found = await safe(async () => {
    for (const s of selectors) {
      const recs = await dns.txt(`${s}._domainkey.${d}`);
      // An empty p= is a revoked key, not a working one.
      if (recs.some((t) => /(^|;)\s*p=[A-Za-z0-9+/]/i.test(t))) return s;
    }
    return null;
  }, undefined as string | null | undefined);
  const dkim: DnsItem =
    found === undefined
      ? unreachable
      : found
        ? { status: "ok", detail: `Signing key found (selector “${found}”).` }
        : {
            status: "missing",
            detail: "No DKIM key found under the usual names.",
            fix: `Turn on DKIM ${p ? `in ${p.where}` : "with your email host"} and add the TXT record it gives you.`,
          };

  // DMARC: a policy record; p=none is a start, quarantine/reject is better.
  const dm = await safe(() => dns.txt(`_dmarc.${d}`), null as string[] | null);
  let dmarc: DnsItem;
  if (!dm) dmarc = unreachable;
  else {
    const rec = dm.find((t) => /^v=DMARC1/i.test(t.trim()));
    if (!rec) dmarc = { status: "missing", detail: "No DMARC record.", fix: `Add a TXT record on _dmarc.${d}: v=DMARC1; p=none; rua=mailto:dmarc@${d}` };
    else {
      const policy = /;\s*p=(\w+)/i.exec(rec)?.[1]?.toLowerCase();
      dmarc =
        policy === "quarantine" || policy === "reject"
          ? { status: "ok", detail: `Policy: ${policy}.` }
          : { status: "ok", detail: "Policy: none (fine to start; move to quarantine once sending is steady)." };
    }
  }

  return { domain: d, checkedAt: now.toISOString(), mx, spf, dkim, dmarc };
}
