import { activationExpiry, hashActivationToken, newActivationToken, resendWaitSeconds } from "@/lib/activation";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { PendingSignup } from "@/models/PendingSignup";
import { validateSignup } from "@/lib/validators";
import { isDuplicateKeyError, jsonError, readJson, serverError, tooManyRequests } from "@/lib/http";
import { hashPassword } from "@/lib/auth";
import { isGoogleOnly } from "@/lib/google";
import { LIMITS } from "@/lib/limits";
import { appBaseUrl, isMailConfigured, sendActivationEmail } from "@/lib/mailer";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import type { SignupPendingResponse } from "@/types";

// POST /api/auth/signup: { name, email, password, confirmPassword, next? } → 202 { email }.
// Emails an activation link. No account exists until that link is opened
// (POST /api/auth/activate), so this logs nobody in. Signing up again replaces
// the waiting signup, and its older link stops working.

/** "Wait a bit" with the time in the message, so the page can just show it. */
function waitForEmail(seconds: number): Response {
  return Response.json(
    { error: `We just sent an email to this address. Please wait ${seconds} seconds before asking for another.` },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request: Request): Promise<Response> {
  if (isGoogleOnly()) return jsonError("Please sign up with Google", 403);

  // Per IP, and one IP can be a whole college or mobile network.
  const limit = rateLimit(`signup:${getClientIp(request)}`, { limit: 30 });
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await readJson(request);
  if (body === undefined) return jsonError("Invalid JSON body", 400);

  const result = validateSignup(body);
  if (!result.ok) return jsonError(result.error, 400);
  const { name, email, password, next } = result.value;

  const baseUrl = appBaseUrl(request);
  if (!baseUrl || !isMailConfigured()) {
    console.error("Signup needs USER_EMAIL, USER_PASS and (in production) a valid APP_URL");
    return jsonError("Sign up by email isn't available right now", 503);
  }

  // Many IPs can target one inbox, so count per address too.
  const emailLimit = rateLimit(`signup-email:${email}`, { limit: 5 });
  if (!emailLimit.ok) return tooManyRequests(emailLimit.retryAfter);

  try {
    await connectDB();
    if (await User.exists({ email })) return jsonError("An account with this email already exists", 409);

    const waiting = await PendingSignup.findOne({ email }).select("lastSentAt").lean();
    const wait = waiting ? resendWaitSeconds(waiting.lastSentAt) : 0;
    if (wait > 0) return waitForEmail(wait);

    const token = newActivationToken();
    const tokenHash = hashActivationToken(token);
    const passwordHash = await hashPassword(password);
    const now = new Date();
    await PendingSignup.updateOne(
      { email },
      { $set: { name, passwordHash, tokenHash, nextPath: next, lastSentAt: now, expiresAt: activationExpiry(now) } },
      { upsert: true, runValidators: true }
    );

    // Saved first: the link must work the moment the email lands.
    const sent = await sendActivationEmail(email, `${baseUrl}/activate/${token}`);
    if (!sent) {
      // Nothing was delivered, so they may try again at once, without waiting.
      await PendingSignup.deleteOne({ email, tokenHash });
      return jsonError("We couldn't send the email. Check the address and try again.", 502);
    }

    const data: SignupPendingResponse = { email };
    return Response.json(data, { status: 202 });
  } catch (err) {
    // A double click: both passed the check above, and the unique index stopped the second.
    if (isDuplicateKeyError(err)) return waitForEmail(LIMITS.ACTIVATION_RESEND_SECONDS);
    return serverError(err);
  }
}
