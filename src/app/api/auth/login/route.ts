import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { INVALID_LOGIN, validateLogin } from "@/lib/validators";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { getDummyHash, setSessionCookie, verifyPassword } from "@/lib/auth";
import { isGoogleOnly } from "@/lib/google";
import { forgiveRateLimit, getClientIp, rateLimit } from "@/lib/rateLimit";

// POST /api/auth/login: { email, password } → sets the session cookie.
export async function POST(request: Request): Promise<Response> {
  if (isGoogleOnly()) return jsonError("Please log in with Google", 403);

  // Limits count failures only (see the forgive calls below). The IP limit is roomy
  // because a whole college or mobile network can share one IP; the per-email one
  // stops guessing one account's password, even from many IPs.
  const ipKey = `login:${getClientIp(request)}`;
  const limit = rateLimit(ipKey, { limit: 30 });
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);

  const result = validateLogin(body);
  if (!result.ok) return jsonError(result.error, result.error === INVALID_LOGIN ? 401 : 400);
  const { email, password } = result.value;

  const emailKey = `login-email:${email}`;
  const emailLimit = rateLimit(emailKey);
  if (!emailLimit.ok) return tooManyRequests(emailLimit.retryAfter);

  try {
    await connectDB();
    const user = await User.findOne({ email }).select("+passwordHash").lean();

    // Always run bcrypt, even for unknown emails, so timing gives nothing away.
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    // One message for every failure, so the response never reveals whether an email is registered.
    // A Google account has no hash: the dummy compare above must not count as a match for it.
    if (!user?.passwordHash || !valid) return jsonError(INVALID_LOGIN, 401);

    forgiveRateLimit(ipKey);
    forgiveRateLimit(emailKey);
    const response = NextResponse.json({ id: String(user._id), name: user.name, email: user.email });
    return await setSessionCookie(response, String(user._id));
  } catch (err) {
    return serverError(err);
  }
}
