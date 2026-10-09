import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Runs before every page request (Next.js 16 "proxy", formerly middleware).
// Logged-out users are sent to /login; logged-in users skip /login and /signup.
// /share/<token> is open to everyone: logged-out visitors get a read-only view.
// This only checks the token signature. API routes still check the user
// in the database themselves, so this is not the only line of defence.

const AUTH_PAGES = ["/login", "/signup"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const loggedIn = Boolean(await verifySessionToken(token));
  const onAuthPage = AUTH_PAGES.includes(pathname);
  const onPublicPage = pathname.startsWith("/share/");

  if (!loggedIn && !onAuthPage && !onPublicPage) {
    const url = new URL("/login", request.url);
    // Remember where the user was going so login can send them back.
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (loggedIn && onAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: skip API routes (they return 401 themselves), Next.js
  // internals and any file with an extension (icons, images).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
