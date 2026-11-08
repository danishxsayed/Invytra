import { channelById, channelBySubdomain, type ChannelDef, type ChannelId } from "@invytra/shared";

/*
 * Where each part of the platform lives. With ROOT_DOMAIN set (e.g. "invytra.com", or
 * "lvh.me:3000" to try subdomains on your own computer):
 *   invytra.com            the website
 *   app.invytra.com        the workspace hub, log in / sign up
 *   linkedin.invytra.com   LinkedIn Outreach (each channel on its own subdomain)
 * One sign-in cookie on .invytra.com works on all of them.
 * Without ROOT_DOMAIN everything is on one address (local development, as before):
 * the hub at /workspace and LinkedIn at /app.
 *
 * No server-only imports here: the middleware uses this too.
 */

export const HUB_SUBDOMAIN = "app";

export interface DomainConfig {
  /** e.g. "invytra.com" or "lvh.me:3000"; null = single-host mode. */
  root: string | null;
  protocol: "http:" | "https:";
}

export function domainConfig(env: Record<string, string | undefined> = process.env): DomainConfig {
  const root = env.ROOT_DOMAIN?.trim().toLowerCase().replace(/^\.+|\/+$/g, "") || null;
  const protocol = (env.WEB_ORIGIN ?? "").startsWith("https://") ? "https:" : "http:";
  return { root, protocol };
}

/** The cookie Domain that covers every subdomain (null in single-host mode: a host-only cookie). */
export function cookieDomain(cfg = domainConfig()): string | undefined {
  return cfg.root ? cfg.root.split(":")[0] : undefined;
}

const hostOnly = (host: string) => host.toLowerCase().split(":")[0]!;
const rootHost = (cfg: DomainConfig) => hostOnly(cfg.root!);
const portOf = (cfg: DomainConfig) => (cfg.root!.includes(":") ? `:${cfg.root!.split(":")[1]}` : "");

/** The hub's address, e.g. "https://app.invytra.com" ("" in single-host mode = this address). */
export function hubOrigin(cfg = domainConfig()): string {
  return cfg.root ? `${cfg.protocol}//${HUB_SUBDOMAIN}.${rootHost(cfg)}${portOf(cfg)}` : "";
}

export function siteOrigin(cfg = domainConfig()): string {
  return cfg.root ? `${cfg.protocol}//${rootHost(cfg)}${portOf(cfg)}` : "";
}

export function channelOrigin(id: ChannelId, cfg = domainConfig()): string {
  const c = channelById(id)!;
  return cfg.root ? `${cfg.protocol}//${c.subdomain}.${rootHost(cfg)}${portOf(cfg)}` : "";
}

/** Pages of the hub other than its home (served from /workspace/<page>). */
export const HUB_PAGES = ["/credits", "/voices", "/videos", "/settings", "/billing", "/do-not-contact", "/inbox", "/contacts"];

/** Link to a page of the hub, e.g. hubHref("/") → "https://app.invytra.com/" or "/workspace". */
export function hubHref(path = "/", cfg = domainConfig()): string {
  // Single-host mode: the hub's "/" is /workspace ("/?denied=x" → "/workspace?denied=x").
  if (!cfg.root) return path === "/" || path.startsWith("/?") ? `/workspace${path.slice(1)}` : HUB_PAGES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`) || path.startsWith(`${p}#`)) ? `/workspace${path}` : path;
  return `${hubOrigin(cfg)}${path}`;
}

/** Link to a page of a channel. Paths are the channel's own (LinkedIn's start with /app). */
export function channelHref(id: ChannelId, path?: string, cfg = domainConfig()): string {
  const c = channelById(id)!;
  return `${channelOrigin(id, cfg)}${path ?? c.basePath}`;
}

export type HostKind =
  | { kind: "single" }
  | { kind: "site" }
  | { kind: "hub" }
  | { kind: "channel"; channel: ChannelDef }
  | { kind: "unknown" };

/** What a request's Host is: the website, the hub, a channel, or something else. */
export function hostKind(host: string, cfg = domainConfig()): HostKind {
  if (!cfg.root) return { kind: "single" };
  const h = hostOnly(host);
  const root = rootHost(cfg);
  if (h === root || h === `www.${root}`) return { kind: "site" };
  if (!h.endsWith(`.${root}`)) return { kind: "unknown" };
  const sub = h.slice(0, -root.length - 1);
  if (sub === HUB_SUBDOMAIN) return { kind: "hub" };
  const channel = channelBySubdomain(sub);
  return channel ? { kind: "channel", channel } : { kind: "unknown" };
}

/**
 * Where to go after logging in: only a path on this site, or a page on one of our own
 * subdomains — never somewhere else (no open redirect).
 */
export function safeNext(next: string | null | undefined, cfg = domainConfig()): string | null {
  if (!next) return null;
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  if (!cfg.root) return null;
  try {
    const u = new URL(next);
    const kind = hostKind(u.host, cfg);
    const sameProtocol = u.protocol === cfg.protocol;
    return sameProtocol && (kind.kind === "hub" || kind.kind === "channel" || kind.kind === "site") && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}
