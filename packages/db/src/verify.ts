import { Resolver } from "node:dns/promises";

/*
 * Email verification: free checks first (format, the domain can receive mail, not a
 * throwaway domain), then a verification service (Reoon, or MillionVerifier) for whether the mailbox
 * itself exists. Without the service a contact is never called valid: format alone
 * proves nothing.
 */

export type VerifyStatus = "VALID" | "INVALID" | "RISKY" | "UNKNOWN";
export type VerifyOutcome = { status: VerifyStatus; detail: string } | { retry: true; error: string };

/** A verification service's answer for one address. */
export interface ServiceAnswer {
  result: "ok" | "catch_all" | "unknown" | "disposable" | "invalid" | "disabled" | "inbox_full" | "spamtrap" | "error";
  role?: boolean;
  didyoumean?: string;
  /** Set when the call itself failed (bad key, no credits…): try again later. */
  error?: string;
}
export interface EmailVerifier {
  name: string;
  check(email: string): Promise<ServiceAnswer>;
}

/** MillionVerifier's real-time API (https://developer.millionverifier.com). */
export function millionVerifier(apiKey: string, fetchImpl: typeof fetch = fetch): EmailVerifier {
  return {
    name: "MillionVerifier",
    async check(email) {
      const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}&timeout=20`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return { result: "error", error: `MillionVerifier answered ${res.status}` };
      const j = (await res.json()) as { result?: string; role?: boolean; didyoumean?: string; error?: string };
      if (j.error) return { result: "error", error: j.error };
      const r = (j.result ?? "unknown").toLowerCase().replace(/[^a-z_]/g, "") as ServiceAnswer["result"];
      return { result: ["ok", "catch_all", "unknown", "disposable", "invalid"].includes(r) ? r : "unknown", role: j.role, didyoumean: j.didyoumean || undefined };
    },
  };
}

/**
 * Reoon's single-address API in "power" mode (https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/):
 * it checks the mailbox itself, which can take from a few seconds to over a minute.
 */
export function reoonVerifier(apiKey: string, fetchImpl: typeof fetch = fetch): EmailVerifier {
  return {
    name: "Reoon",
    async check(email) {
      const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(apiKey)}&mode=power`;
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(100_000) });
      const j = (await res.json().catch(() => ({}))) as { status?: string; reason?: string; message?: string; is_role_account?: boolean; is_deliverable?: boolean };
      const status = (j.status ?? "").toLowerCase();
      if (!res.ok || status === "error" || !status) return { result: "error", error: j.reason || j.message || `Reoon answered ${res.status}` };
      const role = j.is_role_account === true;
      switch (status) {
        case "safe":
          return { result: "ok", role };
        case "role_account": // a shared inbox (info@, sales@): fine if the server takes mail for it
          return { result: j.is_deliverable ? "ok" : "unknown", role: true };
        case "catch_all":
        case "invalid":
        case "disabled":
        case "disposable":
        case "inbox_full":
        case "spamtrap":
          return { result: status, role };
        default: // "unknown", or quick-mode "valid" (doesn't check the mailbox)
          return { result: "unknown", role };
      }
    },
  };
}

/** The verification service from .env: Reoon if its key is set, else MillionVerifier, else none. */
export const verifierFromEnv = (env: NodeJS.ProcessEnv = process.env): EmailVerifier | null =>
  env.REOON_API_KEY ? reoonVerifier(env.REOON_API_KEY) : env.MILLIONVERIFIER_API_KEY ? millionVerifier(env.MILLIONVERIFIER_API_KEY) : null;

/** Throwaway-inbox domains (the common ones; the service catches the rest). */
const DISPOSABLE = new Set(
  (
    "mailinator.com mailinator.net 10minutemail.com 10minutemail.net guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz guerrillamail.de " +
    "grr.la sharklasers.com pokemail.net spam4.me yopmail.com yopmail.fr yopmail.net trashmail.com trashmail.de getnada.com temp-mail.org temp-mail.io " +
    "tempmail.com tempmail.net tempail.com dispostable.com maildrop.cc throwawaymail.com fakeinbox.com mintemail.com mohmal.com emailondeck.com burnermail.io " +
    "moakt.com spamgourmet.com mailnesia.com mytemp.email tempr.email discard.email mailcatch.com inboxkitten.com mvrht.com 1secmail.com 1secmail.org " +
    "1secmail.net tmpmail.org tmpmail.net emailfake.com crazymailing.com mail.tm tmail.ws getairmail.com dropmail.me harakirimail.com mailpoof.com " +
    "throwam.com spambox.us trbvm.com tempinbox.com fakemail.net mailforspam.com"
  ).split(" "),
);
export const isDisposableDomain = (domain: string) => DISPOSABLE.has(domain.toLowerCase());

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;

/** The free checks; null = passed (the service decides). `mx` returns the domain's mail servers, or null if DNS didn't answer. */
export async function freeChecks(email: string, mx: (domain: string) => Promise<string[] | null>): Promise<VerifyOutcome | null> {
  if (!EMAIL_RE.test(email)) return { status: "INVALID", detail: "Not a valid email address" };
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (isDisposableDomain(domain)) return { status: "INVALID", detail: "Disposable (temporary) mailbox" };
  const servers = await mx(domain);
  if (servers && servers.length === 0) return { status: "INVALID", detail: "The domain can't receive email (no mail servers)" };
  return null;
}

export function fromServiceAnswer(a: ServiceAnswer, service: string): VerifyOutcome {
  if (a.result === "error") return { retry: true, error: a.error ?? `${service} didn't answer` };
  const role = a.role ? " · role address (e.g. info@)" : "";
  const hint = a.didyoumean ? ` · did you mean ${a.didyoumean}?` : "";
  switch (a.result) {
    case "ok":
      return { status: "VALID", detail: `Mailbox exists${role}` };
    case "catch_all":
      return { status: "RISKY", detail: `Catch-all domain: accepts any address, so this one can't be confirmed${role}` };
    case "disposable":
      return { status: "INVALID", detail: "Disposable (temporary) mailbox" };
    case "invalid":
      return { status: "INVALID", detail: `Mailbox doesn't exist${hint}` };
    case "disabled":
      return { status: "INVALID", detail: "Mailbox is disabled" };
    case "spamtrap":
      return { status: "INVALID", detail: "Known spam trap: never email it" };
    case "inbox_full":
      return { status: "RISKY", detail: `Inbox is full: emails will bounce until it's cleared${role}` };
    default:
      return { status: "UNKNOWN", detail: `The mail server didn't say${role}` };
  }
}

/**
 * Where a domain takes mail: its MX servers, else its A record (mail can go there too);
 * [] = it can't receive mail; null = DNS didn't answer (decide later). Cached per batch.
 */
export function mxLookup(r: { mx(d: string): Promise<string[]>; a(d: string): Promise<string[]> } = realMailDns()): (domain: string) => Promise<string[] | null> {
  const cache = new Map<string, Promise<string[] | null>>();
  return (domain) => {
    if (!cache.has(domain)) {
      cache.set(
        domain,
        (async () => {
          try {
            const mx = await r.mx(domain);
            return mx.length ? mx : await r.a(domain);
          } catch {
            return null;
          }
        })(),
      );
    }
    return cache.get(domain)!;
  };
}

const MISSING = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);
function realMailDns() {
  const res = new Resolver({ timeout: 5000, tries: 2 });
  const none = (e: unknown) => {
    if (MISSING.has((e as { code?: string })?.code ?? "")) return [] as string[];
    throw e;
  };
  return {
    mx: (d: string) => res.resolveMx(d).then((l) => l.map((m) => m.exchange), none),
    a: (d: string) => res.resolve4(d).then((l) => l, none),
  };
}

/** Verifies one address: free checks, then the service (if set up). */
export async function verifyEmail(email: string, o: { verifier: EmailVerifier | null; mx: (domain: string) => Promise<string[] | null> }): Promise<VerifyOutcome> {
  const free = await freeChecks(email, o.mx);
  if (free) return free;
  if (!o.verifier) return { status: "UNKNOWN", detail: "Passed the free checks; no verification service is set up for the mailbox check" };
  try {
    return fromServiceAnswer(await o.verifier.check(email), o.verifier.name);
  } catch (e) {
    return { retry: true, error: `${o.verifier.name}: ${e instanceof Error ? e.message : "no answer"}` };
  }
}
