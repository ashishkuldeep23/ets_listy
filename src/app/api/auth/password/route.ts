import { NextResponse } from "next/server";
import { hashPassword, requireUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { isGoogleOnly } from "@/lib/google";
import { jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { validatePasswordChange } from "@/lib/validators";
import { User } from "@/models/User";
import type { PasswordStatus } from "@/types";

// My password. A Google account starts without one, so it can set one with no
// current password; any other change needs the current one, so someone at an
// unlocked, logged-in screen can't take over the account.

// GET /api/auth/password: can I use a password here, and do I have one?
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const stored = await User.findById(user.id).select("+passwordHash").lean();
    if (!stored) return jsonError("Please log in", 401);
    const status: PasswordStatus = { allowed: !isGoogleOnly(), hasPassword: Boolean(stored.passwordHash) };
    return Response.json(status);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/auth/password: { newPassword, currentPassword? }
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    // Password login is refused in this mode, so a password here could never be used.
    if (isGoogleOnly()) return jsonError("Passwords are turned off: please log in with Google", 403);

    // By user, not IP: this stops guessing the current password from a stolen session.
    const limit = rateLimit(`password:${user.id}`);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validatePasswordChange(body);
    if (!result.ok) return jsonError(result.error, 400);
    const { newPassword, currentPassword } = result.value;

    const stored = await User.findById(user.id).select("+passwordHash").lean();
    if (!stored) return jsonError("Please log in", 401);
    if (stored.passwordHash) {
      if (!currentPassword) return jsonError("Enter your current password", 400);
      if (!(await verifyPassword(currentPassword, stored.passwordHash))) {
        return jsonError("Your current password is wrong", 400);
      }
    }

    // Logs out every other device (someone may have stolen a session); this one gets a fresh cookie.
    await User.updateOne(
      { _id: stored._id },
      { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { sessionVersion: 1 } }
    );
    return await setSessionCookie(new NextResponse(null, { status: 204 }), user.id);
  } catch (err) {
    return serverError(err);
  }
}
