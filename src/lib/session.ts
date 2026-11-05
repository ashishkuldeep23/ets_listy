import { SignJWT, jwtVerify } from "jose";

// Session token = a signed JWT holding the user id and their session version.
// Kept free of Mongoose/Node-only imports because src/proxy.ts uses it too.

export const SESSION_COOKIE = "listy_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

export interface SessionClaims {
  userId: string;
  /** Must match User.sessionVersion: raising that ends every older session. */
  version: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    // A missing or short secret would make tokens forgeable, so refuse to run.
    throw new Error("SESSION_SECRET must be set and at least 32 characters. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string, version = 0): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

/** What a valid token says, or null for missing/expired/forged ones. */
export async function readSessionToken(token: unknown): Promise<SessionClaims | null> {
  if (typeof token !== "string" || !token) return null;
  const secret = getSecret();
  try {
    // Pin the algorithm so a token can't pick a weaker one (e.g. "none").
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    // Tokens made before versions existed count as 0, so nobody was logged out by adding them.
    return { userId: payload.sub, version: typeof payload.v === "number" ? payload.v : 0 };
  } catch {
    return null;
  }
}

/** Returns the user id from a valid token, or null. Doesn't know about revoked sessions: that needs the DB. */
export async function verifySessionToken(token: unknown): Promise<string | null> {
  return (await readSessionToken(token))?.userId ?? null;
}
