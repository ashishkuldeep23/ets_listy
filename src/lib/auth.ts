import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import type { GoogleProfile } from "@/lib/google";
import { jsonError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, readSessionToken } from "@/lib/session";
import { User } from "@/models/User";
import type { SessionUser } from "@/types";

// Password hashing, reading the session from a request, and setting or
// clearing the session cookie. API routes use requireUser() to get the
// current user.

const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Login compares against this hash when the email doesn't exist, so both
// cases take the same time and an attacker can't find registered emails by
// timing the response. Made once, on first use.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash("listy-dummy-password", BCRYPT_COST);
  return dummyHash;
}

/** Reads one cookie from a plain Request (works in tests, unlike next/headers). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      // Cookies are browser input: a broken one means "no cookie", not a 500.
      return null;
    }
  }
  return null;
}

/** The logged-in user as { id, name, email }, or null. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const claims = await readSessionToken(readCookie(request, SESSION_COOKIE));
  if (!claims || !mongoose.isValidObjectId(claims.userId)) return null;

  await connectDB();
  // Look the user up every time so a deleted account or an ended session stops working at once.
  const user = await User.findById(claims.userId).lean();
  if (!user || (user.sessionVersion ?? 0) !== claims.version) return null;
  return { id: String(user._id), name: user.name, email: user.email };
}

/**
 * Returns the logged-in user, or a 401 Response. Use as:
 *   const user = await requireUser(request);
 *   if (user instanceof Response) return user;
 */
export async function requireUser(request: Request): Promise<SessionUser | Response> {
  const user = await getSessionUser(request);
  if (user) return user;
  const response = jsonError("Please log in", 401);
  // src/proxy.ts checks only the signature, so it would keep sending someone with an
  // ended session from /login back to the home page. Dropping the cookie breaks that loop.
  if (readCookie(request, SESSION_COOKIE) !== null) {
    const secure = cookieOptions.secure ? "; Secure" : "";
    response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  }
  return response;
}

const cookieOptions = {
  httpOnly: true, // not readable from JavaScript, so XSS can't steal it
  sameSite: "lax", // not sent on cross-site POSTs (CSRF protection)
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** Signs a token for the user and sets it on a NextResponse. */
export async function setSessionCookie(response: NextResponse, userId: string): Promise<NextResponse> {
  await connectDB();
  const user = await User.findById(userId).select("sessionVersion").lean();
  const token = await createSessionToken(userId, user?.sessionVersion ?? 0);
  response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}

/** Holds a Google login in progress: "<random state>.<encoded next path>". */
export const GOOGLE_STATE_COOKIE = "listy_google_state";
export const oauthCookieOptions = { ...cookieOptions, path: "/api/auth/google" } as const;

/**
 * The Listy account for a Google profile, or null if this email already
 * belongs to a different Google account. Signup doesn't verify emails, so
 * anyone could have registered this address with a password before its real
 * owner came along. Google has now proven ownership, so linking removes that
 * password and ends every older session: otherwise whoever set it could still
 * get into the account.
 */
export async function findOrCreateGoogleUser({ sub, email, name }: GoogleProfile): Promise<string | null> {
  await connectDB();
  const linked = await User.findOne({ googleId: sub }).select("_id").lean();
  if (linked) return String(linked._id);

  const existing = await User.findOne({ email }).select("+googleId").lean();
  if (existing) {
    if (existing.googleId) return null;
    await User.updateOne(
      { _id: existing._id },
      { $set: { googleId: sub }, $unset: { passwordHash: 1 }, $inc: { sessionVersion: 1 } }
    );
    return String(existing._id);
  }
  try {
    const user = await User.create({ name: name.slice(0, LIMITS.USER_NAME_MAX), email, googleId: sub });
    return String(user._id);
  } catch (err) {
    // A double click can send two first logins at once: the unique index stops the second.
    if (typeof err === "object" && err !== null && "code" in err && err.code === 11000) {
      const winner = await User.findOne({ googleId: sub }).select("_id").lean();
      if (winner) return String(winner._id);
    }
    throw err;
  }
}
