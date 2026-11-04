// "Continue with Google" (OpenID Connect, authorization code flow), plus the
// ONLY_LOGIN_WITH_GOOGLE switch. Server only: GOOGLE_CLIENT_SECRET must never
// reach the browser. No library needed: two URLs and one token check.

import { decodeJwt } from "jose";
import type { Result } from "@/types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const TOKEN_TIMEOUT_MS = 10_000;
const FAILED = "Google login failed";

export interface GoogleProfile {
  /** Google's permanent id for this account (an email address can change). */
  sub: string;
  email: string;
  name: string;
}

/** Password login and signup are off; read per request so changing the env needs no rebuild. */
export const isGoogleOnly = (): boolean => process.env.ONLY_LOGIN_WITH_GOOGLE === "true";

export const isGoogleConfigured = (): boolean =>{
  console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}


export const showEnvValsOnConsole = () =>{
  return {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  }
}

  // Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Must exactly match an "Authorized redirect URI" in the Google Cloud console. */
export const googleRedirectUri = (request: Request): string =>
  `${new URL(request.url).origin}/api/auth/google/callback`;

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Lets someone with several Google accounts pick one, instead of being logged in silently.
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

/**
 * Checks the ID token's claims. The signature isn't checked: the token comes
 * straight from Google over TLS in exchange for our secret, which OpenID
 * Connect allows (Core 3.1.3.7). An unverified email is refused, because the
 * email decides which Listy account this is.
 */
export function parseGoogleIdToken(idToken: unknown, clientId: string, now = Date.now()): Result<GoogleProfile> {
  if (typeof idToken !== "string") return { ok: false, error: FAILED };
  let claims: ReturnType<typeof decodeJwt>;
  try {
    claims = decodeJwt(idToken);
  } catch {
    return { ok: false, error: FAILED };
  }
  const { iss, aud, exp, sub, email, email_verified: verified, name } = claims;
  if (
    !ISSUERS.includes(iss ?? "") ||
    aud !== clientId ||
    typeof exp !== "number" ||
    exp * 1000 <= now ||
    typeof sub !== "string" ||
    !sub ||
    typeof email !== "string" ||
    !email ||
    verified !== true
  ) {
    return { ok: false, error: FAILED };
  }
  const clean = email.trim().toLowerCase();
  // People may have no display name on Google.
  const shown = typeof name === "string" && name.trim() ? name.trim() : (clean.split("@")[0] ?? clean);
  return { ok: true, value: { sub, email: clean, name: shown } };
}

/** Swaps the one-time code from the redirect for the user's profile. Never throws. */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<Result<GoogleProfile>> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!res.ok) {
      // The status only: Google's error body can echo request details.
      console.error("Google token exchange failed", res.status);
      return { ok: false, error: FAILED };
    }
    const data: unknown = await res.json();
    const idToken = typeof data === "object" && data !== null && "id_token" in data ? data.id_token : undefined;
    return parseGoogleIdToken(idToken, clientId);
  } catch (err) {
    console.error("Google token exchange failed", err);
    return { ok: false, error: FAILED };
  }
}
