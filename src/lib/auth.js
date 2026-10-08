import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "@/lib/session";
import { User } from "@/models/User";

// Password hashing, reading the session from a request, and setting or
// clearing the session cookie. API routes use requireUser() to get the
// current user.

const BCRYPT_COST = 12;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Login compares against this hash when the email doesn't exist, so both
// cases take the same time and an attacker can't find registered emails by
// timing the response. Made once, on first use.
let dummyHash;
export function getDummyHash() {
  dummyHash ??= bcrypt.hash("listy-dummy-password", BCRYPT_COST);
  return dummyHash;
}

/** Reads one cookie from a plain Request (works in tests, unlike next/headers). */
function readCookie(request, name) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The logged-in user as { id, name, email }, or null. */
export async function getSessionUser(request) {
  const userId = await verifySessionToken(readCookie(request, SESSION_COOKIE));
  if (!userId || !mongoose.isValidObjectId(userId)) return null;

  await connectDB();
  // Look the user up every time so a deleted account stops working at once.
  const user = await User.findById(userId).lean();
  if (!user) return null;
  return { id: String(user._id), name: user.name, email: user.email };
}

/**
 * Returns the logged-in user, or a 401 Response. Use as:
 *   const user = await requireUser(request);
 *   if (user instanceof Response) return user;
 */
export async function requireUser(request) {
  const user = await getSessionUser(request);
  return user ?? jsonError("Please log in", 401);
}

const cookieOptions = {
  httpOnly: true, // not readable from JavaScript, so XSS can't steal it
  sameSite: "lax", // not sent on cross-site POSTs (CSRF protection)
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Signs a token for the user and sets it on a NextResponse. */
export async function setSessionCookie(response, userId) {
  const token = await createSessionToken(userId);
  response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE });
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
