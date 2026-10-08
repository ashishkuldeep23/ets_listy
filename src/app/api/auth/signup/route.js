import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { validateSignup } from "@/lib/validators";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

// POST /api/auth/signup: { name, email, password } → creates the user and logs them in.
export async function POST(request) {
  const limit = rateLimit(`signup:${getClientIp(request)}`);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);

  const result = validateSignup(body);
  if (!result.ok) return jsonError(result.error, 400);
  const { name, email, password } = result.value;

  try {
    await connectDB();
    if (await User.exists({ email })) return jsonError("An account with this email already exists", 409);

    const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
    const response = NextResponse.json({ id: String(user._id), name: user.name, email: user.email }, { status: 201 });
    return await setSessionCookie(response, user._id);
  } catch (err) {
    // Two signups with the same email at the same moment: the unique index catches the second.
    if (err?.code === 11000) return jsonError("An account with this email already exists", 409);
    return serverError(err);
  }
}

