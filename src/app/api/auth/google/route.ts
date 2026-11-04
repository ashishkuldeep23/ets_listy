import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, oauthCookieOptions } from "@/lib/auth";
import { googleAuthUrl, googleRedirectUri, isGoogleConfigured } from "@/lib/google";
import { tooManyRequests } from "@/lib/http";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { safeNextPath } from "@/lib/safeRedirect";

const STATE_MAX_AGE = 10 * 60;

// GET /api/auth/google?next=: sends the browser to Google's account picker.
export async function GET(request: Request): Promise<Response> {
  const limit = rateLimit(`google:${getClientIp(request)}`);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const url = new URL(request.url);
  if (!isGoogleConfigured()) return NextResponse.redirect(new URL("/login?error=google", url.origin));

  // Random state in a cookie: the callback accepts only a login this browser started (CSRF protection).
  const state = randomBytes(24).toString("hex");
  const next = safeNextPath(url.searchParams.get("next"));
  const response = NextResponse.redirect(
    googleAuthUrl(process.env.GOOGLE_CLIENT_ID ?? "", googleRedirectUri(request), state)
  );
  response.cookies.set(GOOGLE_STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, {
    ...oauthCookieOptions,
    maxAge: STATE_MAX_AGE,
  });
  return response;
}
