import { GUEST_ID_HEADER } from "@/lib/constants";
import { connectDB } from "@/lib/db";
import { folderForShareToken, guestChatter, handlePresence } from "@/lib/chat";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { cleanGuestId } from "@/lib/validators";

// POST /api/share/:token/presence: heartbeat for a guest on the share link
// (no login). The guest is known only by the random id in the
// x-listy-guest header. Works only while the link is on.

type Ctx = RouteContext<"/api/share/[token]/presence">;

const INVALID = "This link is not valid or was turned off";

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const limit = rateLimit(`share-presence:${getClientIp(request)}`, { limit: 600 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const guestId = cleanGuestId(request.headers.get(GUEST_ID_HEADER));
    if (!guestId) return jsonError("Missing guest id", 400);

    const { token } = await ctx.params;
    await connectDB();
    const folder = await folderForShareToken(token);
    if (!folder) return jsonError(INVALID, 404);

    return await handlePresence(request, folder, guestChatter(guestId));
  } catch (err) {
    return serverError(err);
  }
}
