import { describe, expect, it } from "vitest";
import { channelHref, cookieDomain, hostKind, hubHref, safeNext, type DomainConfig } from "../src/lib/domains";
import { routeRequest } from "../src/lib/routing";
import { CHANNELS, canUseChannel, channelById } from "@invytra/shared";

const live: DomainConfig = { root: "invytra.com", protocol: "https:" };
const local: DomainConfig = { root: "lvh.me:3000", protocol: "http:" };
const single: DomainConfig = { root: null, protocol: "http:" };
const go = (host: string, pathname: string, hasSession = true, cfg = live, search = "") => routeRequest({ host, pathname, search, hasSession }, cfg);

describe("channels", () => {
  it("lists LinkedIn as live and the rest as coming soon", () => {
    expect(CHANNELS.map((c) => [c.id, c.status])).toEqual([
      ["linkedin", "live"],
      ["whatsapp", "soon"],
      ["email", "soon"],
      ["instagram", "soon"],
    ]);
  });
  it("lets a workspace use only launched channels its plan includes", () => {
    expect(canUseChannel(channelById("linkedin"), ["linkedin"])).toBe(true);
    expect(canUseChannel(channelById("linkedin"), [])).toBe(false);
    expect(canUseChannel(channelById("whatsapp"), ["linkedin", "whatsapp"])).toBe(false); // not launched
  });
});

describe("domains", () => {
  it("knows each host", () => {
    expect(hostKind("invytra.com", live)).toEqual({ kind: "site" });
    expect(hostKind("www.invytra.com", live)).toEqual({ kind: "site" });
    expect(hostKind("app.invytra.com", live)).toEqual({ kind: "hub" });
    expect(hostKind("LinkedIn.Invytra.com", live)).toMatchObject({ kind: "channel", channel: { id: "linkedin" } });
    expect(hostKind("evil.com", live)).toEqual({ kind: "unknown" });
    expect(hostKind("invytra.com.evil.com", live)).toEqual({ kind: "unknown" });
    expect(hostKind("linkedin.lvh.me:3000", local)).toMatchObject({ kind: "channel" });
    expect(hostKind("localhost:3000", single)).toEqual({ kind: "single" });
  });
  it("builds links and the shared cookie domain", () => {
    expect(hubHref("/", live)).toBe("https://app.invytra.com/");
    expect(channelHref("linkedin", undefined, live)).toBe("https://linkedin.invytra.com/app");
    expect(channelHref("linkedin", "/app/inbox", local)).toBe("http://linkedin.lvh.me:3000/app/inbox");
    expect(cookieDomain(live)).toBe("invytra.com");
    expect(cookieDomain(local)).toBe("lvh.me");
    expect(cookieDomain(single)).toBeUndefined();
    expect(hubHref("/", single)).toBe("/workspace");
    expect(hubHref("/?denied=email", single)).toBe("/workspace?denied=email");
    expect(channelHref("linkedin", undefined, single)).toBe("/app");
  });
  it("only sends people back to our own pages after signing in", () => {
    expect(safeNext("/app/inbox", live)).toBe("/app/inbox");
    expect(safeNext("https://linkedin.invytra.com/app/campaigns", live)).toBe("https://linkedin.invytra.com/app/campaigns");
    expect(safeNext("https://evil.com/", live)).toBeNull();
    expect(safeNext("https://invytra.com.evil.com/", live)).toBeNull();
    expect(safeNext("//evil.com", live)).toBeNull();
    expect(safeNext("/\\evil.com", live)).toBeNull();
    expect(safeNext("http://linkedin.invytra.com/", live)).toBeNull(); // not https
    expect(safeNext("https://user:pw@linkedin.invytra.com/", live)).toBeNull();
    expect(safeNext("https://linkedin.invytra.com/", single)).toBeNull();
  });
});

describe("routing by host", () => {
  it("serves the hub on app.<domain>, after signing in", () => {
    expect(go("app.invytra.com", "/")).toEqual({ type: "rewrite", path: "/workspace" });
    expect(go("app.invytra.com", "/", false)).toEqual({ type: "redirect", url: "https://app.invytra.com/login?next=%2F" });
    expect(go("app.invytra.com", "/login", false)).toEqual({ type: "next" });
    expect(go("app.invytra.com", "/app/inbox")).toEqual({ type: "redirect", url: "https://linkedin.invytra.com/app/inbox" });
    expect(go("app.invytra.com", "/pricing")).toEqual({ type: "redirect", url: "https://invytra.com/pricing" });
  });
  it("serves LinkedIn on its subdomain, with or without /app in the path", () => {
    expect(go("linkedin.invytra.com", "/")).toEqual({ type: "rewrite", path: "/app" });
    expect(go("linkedin.invytra.com", "/campaigns")).toEqual({ type: "rewrite", path: "/app/campaigns" });
    expect(go("linkedin.invytra.com", "/app/campaigns/x")).toEqual({ type: "next" });
    expect(go("linkedin.invytra.com", "/login")).toEqual({ type: "redirect", url: "https://app.invytra.com/" });
  });
  it("sends signed-out visitors of a channel to log in, and back afterwards", () => {
    expect(go("linkedin.invytra.com", "/app/inbox", false, live, "?c=1")).toEqual({
      type: "redirect",
      url: `https://app.invytra.com/login?next=${encodeURIComponent("https://linkedin.invytra.com/app/inbox?c=1")}`,
    });
  });
  it("sends upcoming channels and unknown hosts away", () => {
    expect(go("whatsapp.invytra.com", "/")).toEqual({ type: "redirect", url: "https://app.invytra.com/?soon=whatsapp" });
    expect(go("random.invytra.com", "/x")).toEqual({ type: "redirect", url: "https://invytra.com/x" });
  });
  it("keeps the website on the main domain, and moves app pages to their subdomains", () => {
    expect(go("invytra.com", "/pricing", false)).toEqual({ type: "next" });
    expect(go("invytra.com", "/login", false, live, "?next=%2F")).toEqual({ type: "redirect", url: "https://app.invytra.com/login?next=%2F" });
    expect(go("invytra.com", "/app", false)).toEqual({ type: "redirect", url: "https://linkedin.invytra.com/app" });
  });
  it("works as before on one address (no ROOT_DOMAIN)", () => {
    expect(go("localhost:3000", "/app/inbox", true, single)).toEqual({ type: "next" });
    expect(go("localhost:3000", "/app/inbox", false, single)).toEqual({ type: "redirect", url: "/login?next=%2Fapp%2Finbox" });
    expect(go("localhost:3000", "/workspace", false, single)).toEqual({ type: "redirect", url: "/login?next=%2Fworkspace" });
    expect(go("localhost:3000", "/pricing", false, single)).toEqual({ type: "next" });
  });
});
