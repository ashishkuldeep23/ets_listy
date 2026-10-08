import { SignJWT, jwtVerify } from "jose";

// Session token = a signed JWT holding only the user id. Kept free of
// Mongoose/Node-only imports because src/proxy.js uses it too.

export const SESSION_COOKIE = "listy_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // A missing or short secret would make tokens forgeable, so refuse to run.
    throw new Error("SESSION_SECRET must be set and at least 32 characters. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/** Returns the user id from a valid token, or null for missing/expired/forged ones. */
export async function verifySessionToken(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !token) return null;
  const secret = getSecret();
  try {
    // Pin the algorithm so a token can't pick a weaker one (e.g. "none").
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
