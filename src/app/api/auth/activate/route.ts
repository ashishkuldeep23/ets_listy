import { NextResponse } from "next/server";
import { hashActivationToken } from "@/lib/activation";
import { getSessionUser, setSessionCookie } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { isGoogleOnly } from "@/lib/google";
import { isDuplicateKeyError, jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { validateActivation } from "@/lib/validators";
import { PendingSignup } from "@/models/PendingSignup";
import { User } from "@/models/User";
import type { ActivationResponse } from "@/types";

// POST /api/auth/activate: { token } → 201, the new user + session cookie.
// POST because the page calls it from a script: mail scanners open every link
// in an email (GET), and that alone must not use up the token.

const INVALID = "This link is invalid, has expired or was already used";
const ALREADY_EXISTS = "This account already exists. Please log in.";

export async function POST(request: Request): Promise<Response> {
  if (isGoogleOnly()) return jsonError("Please log in with Google", 403);

  const limit = rateLimit(`activate:${getClientIp(request)}`, { limit: 100 });
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);
  const result = validateActivation(body);
  if (!result.ok) return jsonError(INVALID, 400);

  try {
    await connectDB();
    const tokenHash = hashActivationToken(result.value.token);
    // The date too: MongoDB's own clean-up can run a little late.
    const pending = await PendingSignup.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      .select("+passwordHash")
      .lean();
    if (!pending) return jsonError(INVALID, 400);

    // Don't silently swap accounts (someone could send me their link to get my
    // lists saved into their account). The link stays usable after logging out.
    if (await getSessionUser(request)) {
      return jsonError("You're already logged in. Log out, then open this link again.", 409);
    }

    // They may have used Google with this email since signing up.
    if (await User.exists({ email: pending.email })) {
      await PendingSignup.deleteOne({ _id: pending._id });
      return jsonError(ALREADY_EXISTS, 409);
    }

    const user = await User.create({ name: pending.name, email: pending.email, passwordHash: pending.passwordHash });
    await PendingSignup.deleteOne({ _id: pending._id });

    const data: ActivationResponse = { id: String(user._id), name: user.name, email: user.email, next: pending.nextPath };
    return await setSessionCookie(NextResponse.json(data, { status: 201 }), String(user._id));
  } catch (err) {
    // The link opened twice at once: the unique email index stops the second.
    if (isDuplicateKeyError(err)) return jsonError(ALREADY_EXISTS, 409);
    return serverError(err);
  }
}
