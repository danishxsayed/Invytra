import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate: no session cookie → send to /login. The cookie's signature and
 * the user's membership are verified on the server by requireUser().
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("invytra_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
