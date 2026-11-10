import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isSocialUrl, type SiteCheck } from "@invytra/shared";

/*
 * Opens a business's website (the one on its Google listing) and notes what's there: does it
 * load, is it set up for phones, the copyright year, online booking or ordering, contact
 * emails. Only public addresses are opened (never the server's own network), with a short
 * timeout and a size cap.
 */

const MAX_BYTES = 1_500_000;
const UA = "Mozilla/5.0 (compatible; InvytraBot/1.0; +https://invytra.com/bot)";

/** Private, loopback, link-local and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

export type Resolve = (host: string) => Promise<string[]>;
const resolveDns: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function publicUrl(raw: string, resolve: Resolve): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("not a web address");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => {
    throw new Error("DNS not found");
  });
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error("not a public address");
  return u;
}

/** GET a page, following up to 4 redirects, each checked; at most MAX_BYTES of HTML. */
export async function fetchPage(raw: string, opts: { fetch?: typeof fetch; resolve?: Resolve; timeoutMs?: number } = {}) {
  const f = opts.fetch ?? fetch;
  const resolve = opts.resolve ?? resolveDns;
  let url = await publicUrl(raw, resolve);
  for (let hop = 0; hop < 5; hop++) {
    const res = await f(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = await publicUrl(new URL(loc, url).toString(), resolve);
      continue;
    }
    let html = "";
    if (res.body && /html|text/i.test(res.headers.get("content-type") ?? "text/html")) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let n = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        n += value.length;
        html += dec.decode(value, { stream: true });
        if (n > MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    }
    return { status: res.status, finalUrl: url.toString(), html };
  }
  throw new Error("too many redirects");
}

const BOOKING: [RegExp, string][] = [
  [/practo\.com/i, "Practo booking"],
  [/calendly\.com/i, "Calendly booking"],
  [/opentable\.|eazydiner\.|dineout\.|tablein\.|resy\.com/i, "table reservation widget"],
  [/zocdoc\.|setmore\.|simplybook\.|acuityscheduling\.|fresha\.|booksy\.|squareup\.com\/appointments/i, "online booking widget"],
  [/\b(book|schedule|request)\s+(an?\s+)?(appointment|consultation|table|slot|visit)\b/i, "a booking link"],
  [/\b(book\s+now|book\s+online|reserve\s+(a\s+)?table|online\s+reservation)\b/i, "a booking link"],
];
const ORDERING: [RegExp, string][] = [
  [/swiggy\.com|zomato\.com\/[^"']*order|ubereats\.|doordash\.|deliveroo\.|talabat\./i, "food delivery ordering link"],
  [/\b(order\s+online|order\s+now|add\s+to\s+cart|online\s+ordering)\b/i, "online ordering"],
  [/cdn\.shopify\.com|woocommerce/i, "an online shop"],
];
const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(sentry|example|domain|email|wixpress|sentry-next)\.|^(no-?reply|u00)/i;

/** What a homepage shows (pure; exported for tests). */
export function readHomepage(html: string): Omit<SiteCheck, "status" | "checkedAt"> {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim();
  const mobileFriendly = /<meta[^>]+name=["']?viewport["']?[^>]*width=device-width/i.test(html) || /<meta[^>]+width=device-width[^>]*name=["']?viewport/i.test(html);
  const generator = /<meta[^>]+name=["']?generator["']?[^>]+content=["']([^"']{1,80})["']/i.exec(html)?.[1];
  const years = [...text.matchAll(/(?:©|&copy;|copyright)[^0-9<]{0,30}((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi)].map((m) => Number(m[2] ?? m[1]));
  const found = (list: [RegExp, string][]) => list.find(([re]) => re.test(html))?.[1] ?? null;
  const emails = [
    ...new Set(
      [...html.matchAll(/mailto:([^"'?\s>]+)/gi), ...text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)]
        .map((m) => decodeURIComponent((m[1] ?? m[0]).trim()).toLowerCase())
        .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !BAD_EMAIL.test(e)),
    ),
  ].slice(0, 3);
  return {
    title: title || undefined,
    mobileFriendly,
    generator: generator || undefined,
    copyrightYear: years.length ? Math.max(...years) : undefined,
    booking: found(BOOKING),
    ordering: found(ORDERING),
    emails,
  };
}

/** Checks a business's listed website. */
export async function checkSite(website: string | null | undefined, opts: { fetch?: typeof fetch; resolve?: Resolve; now?: Date } = {}): Promise<SiteCheck> {
  const checkedAt = (opts.now ?? new Date()).toISOString();
  if (!website) return { status: "none", checkedAt };
  if (isSocialUrl(website)) return { status: "social", url: website, checkedAt };
  try {
    const page = await fetchPage(website, opts);
    if (page.status >= 400) return { status: "broken", url: website, finalUrl: page.finalUrl, httpStatus: page.status, checkedAt };
    const seen = readHomepage(page.html);
    // No email on the homepage: one look at the contact page.
    if (!seen.emails?.length) {
      const contact = /href=["']([^"']*contact[^"']*)["']/i.exec(page.html)?.[1];
      if (contact) {
        const c = await fetchPage(new URL(contact, page.finalUrl).toString(), opts).catch(() => null);
        if (c && c.status < 400) seen.emails = readHomepage(c.html).emails;
      }
    }
    return { status: "ok", url: website, finalUrl: page.finalUrl, httpStatus: page.status, https: page.finalUrl.startsWith("https:"), ...seen, checkedAt };
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
    const msg = [e instanceof Error ? e.message : String(e), cause?.code, cause?.message].filter(Boolean).join(" ");
    const error = /timeout|aborted/i.test(msg) ? "timed out" : /DNS|ENOTFOUND/i.test(msg) ? "DNS not found" : /certificate|SSL|TLS|CERT/i.test(msg) ? "security certificate error" : /ECONNREFUSED|ECONNRESET/i.test(msg) ? "connection refused" : msg.slice(0, 60);
    return { status: "broken", url: website, error, checkedAt };
  }
}
