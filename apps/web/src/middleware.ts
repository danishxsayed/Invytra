import { NextResponse, type NextRequest } from "next/server";
import { routeRequest } from "@/lib/routing";
import { SESSION_COOKIE } from "@/lib/session-token";

/**
 * Sends each request to the right part of the platform by its host (website, workspace
 * hub, or a channel's subdomain; see lib/domains.ts), and signed-out visitors of the hub
 * and channels to log in. Only the cookie's presence is checked here: pages verify the
 * session, the workspace and channel access on the server (requireUser / requireChannel).
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const decision = routeRequest({
    host,
    pathname: req.nextUrl.pathname,
    search: req.nextUrl.search,
    hasSession: req.cookies.has(SESSION_COOKIE),
  });
  if (decision.type === "redirect") return NextResponse.redirect(new URL(decision.url, req.nextUrl));
  if (decision.type === "rewrite") {
    const url = req.nextUrl.clone();
    url.pathname = decision.path;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

// Everything except Next's own files, API routes (webhooks) and static files.
export const config = { matcher: ["/((?!_next/|api/|.*\\.[A-Za-z0-9]+$).*)"] };
