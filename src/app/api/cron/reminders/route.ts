import { createHash, timingSafeEqual } from "node:crypto";
import { jsonError, serverError } from "@/lib/http";
import { isPushConfigured, sendDueReminders } from "@/lib/reminders";

const sha256 = (text: string) => createHash("sha256").update(text).digest();

/** Hashed first so the compare takes the same time whatever the length. No secret set: nobody gets in. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(sha256(request.headers.get("authorization") ?? ""), sha256(`Bearer ${secret}`));
}

// GET /api/cron/reminders: run every minute by a scheduler, which proves
// itself with "Authorization: Bearer <CRON_SECRET>". Not a user request, so
// it has no requireUser (see security rule 7).
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return jsonError("Unauthorized", 401);
  if (!isPushConfigured()) return jsonError("Push is not configured", 503);
  try {
    return Response.json(await sendDueReminders());
  } catch (err) {
    return serverError(err);
  }
}
