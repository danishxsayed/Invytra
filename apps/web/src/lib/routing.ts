import { CHANNELS } from "@invytra/shared";
import { hostKind, channelOrigin, domainConfig, hubOrigin, siteOrigin, type DomainConfig } from "./domains";

export type RouteDecision = { type: "next" } | { type: "rewrite"; path: string } | { type: "redirect"; url: string };

const AUTH_PATHS = ["/login", "/signup"];
const is = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * Which page a request gets, by host (the website, the hub, a channel's subdomain). Pure, so
 * it's tested on its own; the middleware applies it. Signed-in checks here only look for the
 * cookie: every page re-checks the session, the workspace and channel access on the server.
 */
export function routeRequest(
  req: { host: string; pathname: string; search: string; hasSession: boolean },
  cfg: DomainConfig = domainConfig(),
): RouteDecision {
  const { pathname: path, search, hasSession } = req;
  // Public pages that work for anyone, on any host (links inside emails).
  if (path.startsWith("/unsubscribe/")) return { type: "next" };
  const where = hostKind(req.host, cfg);
  const login = (next: string) => `/login?next=${encodeURIComponent(next)}`;

  switch (where.kind) {
    case "single":
      // Everything on one address: the hub at /workspace, each channel at its base path (/app, /email …).
      if ((is(path, "/workspace") || CHANNELS.some((c) => is(path, c.basePath))) && !hasSession) return { type: "redirect", url: login(path + search) };
      return { type: "next" };

    case "site":
      if (is(path, "/app")) return { type: "redirect", url: `${channelOrigin("linkedin", cfg)}${path}${search}` };
      if (is(path, "/workspace")) return { type: "redirect", url: `${hubOrigin(cfg)}/` };
      if (AUTH_PATHS.includes(path)) return { type: "redirect", url: `${hubOrigin(cfg)}${path}${search}` };
      return { type: "next" };

    case "hub":
      if (AUTH_PATHS.includes(path)) return { type: "next" };
      if (path === "/" || path === "/workspace") {
        if (!hasSession) return { type: "redirect", url: `${hubOrigin(cfg)}${login("/")}` };
        return path === "/" ? { type: "rewrite", path: "/workspace" } : { type: "redirect", url: `${hubOrigin(cfg)}/` };
      }
      // LinkedIn pages opened on the hub (old links): to its own subdomain.
      if (is(path, "/app")) return { type: "redirect", url: `${channelOrigin("linkedin", cfg)}${path}${search}` };
      return { type: "redirect", url: `${siteOrigin(cfg)}${path}${search}` };

    case "channel": {
      const c = where.channel;
      if (c.status !== "live") return { type: "redirect", url: `${hubOrigin(cfg)}/?soon=${c.id}` };
      const here = `${channelOrigin(c.id, cfg)}${path}${search}`;
      if (!hasSession) return { type: "redirect", url: `${hubOrigin(cfg)}${login(here)}` };
      if (AUTH_PATHS.includes(path) || is(path, "/workspace")) return { type: "redirect", url: `${hubOrigin(cfg)}/` };
      if (is(path, c.basePath)) return { type: "next" };
      return { type: "rewrite", path: path === "/" ? c.basePath : `${c.basePath}${path}` };
    }

    case "unknown":
      return { type: "redirect", url: `${siteOrigin(cfg)}${path}${search}` };
  }
}
