import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { INVALID_LOGIN, validateLogin } from "@/lib/validators";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { getDummyHash, setSessionCookie, verifyPassword } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

// POST /api/auth/login: { email, password } → sets the session cookie.
export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(`login:${getClientIp(request)}`);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);

  const result = validateLogin(body);
  if (!result.ok) return jsonError(result.error, result.error === INVALID_LOGIN ? 401 : 400);
  const { email, password } = result.value;

  try {
    await connectDB();
    const user = await User.findOne({ email }).select("+passwordHash").lean();

    // Always run bcrypt, even for unknown emails, so timing gives nothing away.
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    // One message for every failure, so the response never reveals whether an email is registered.
    if (!user || !valid) return jsonError(INVALID_LOGIN, 401);

    const response = NextResponse.json({ id: String(user._id), name: user.name, email: user.email });
    return await setSessionCookie(response, String(user._id));
  } catch (err) {
    return serverError(err);
  }
}
