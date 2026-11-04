import { NextResponse } from "next/server";
import { findOrCreateGoogleUser, GOOGLE_STATE_COOKIE, oauthCookieOptions, readCookie, setSessionCookie } from "@/lib/auth";
import { exchangeGoogleCode, googleRedirectUri, isGoogleConfigured } from "@/lib/google";
import { tooManyRequests } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { safeNextPath } from "@/lib/safeRedirect";

// GET /api/auth/google/callback?code=&state=: Google sends the browser back
// here. Checks the state, gets the profile, logs in (making the account the
// first time). Every failure shows one generic message on the login page.
export async function GET(request: Request): Promise<Response> {
  const limit = rateLimit(`google:${getClientIp(request)}`);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const url = new URL(request.url);
  /** The state is single use: the cookie goes on every outcome. */
  const finish = (response: NextResponse) => {
    response.cookies.set(GOOGLE_STATE_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
    return response;
  };
  const fail = () => finish(NextResponse.redirect(new URL("/login?error=google", url.origin)));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = readCookie(request, GOOGLE_STATE_COOKIE) ?? "";
  const dot = cookie.indexOf(".");
  if (!isGoogleConfigured() || !code || code.length > LIMITS.GOOGLE_CODE_MAX || !state || dot < 1 || cookie.slice(0, dot) !== state) {
    return fail();
  }

  const profile = await exchangeGoogleCode(code, googleRedirectUri(request));
  if (!profile.ok) return fail();

  try {
    const userId = await findOrCreateGoogleUser(profile.value);
    if (!userId) return fail();
    // Checked again here: a cookie is browser input.
    const next = safeNextPath(decodeURIComponent(cookie.slice(dot + 1)));
    return await setSessionCookie(finish(NextResponse.redirect(new URL(next, url.origin))), userId);
  } catch (err) {
    console.error("Google login failed", err);
    return fail();
  }
}
