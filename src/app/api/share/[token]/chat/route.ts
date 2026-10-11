import { GUEST_ID_HEADER } from "@/lib/constants";
import { connectDB } from "@/lib/db";
import { folderForShareToken, guestChatter, handleChatList, handleChatPost } from "@/lib/chat";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { cleanGuestId } from "@/lib/validators";

// GET  /api/share/:token/chat[?after=ISO] → { messages }
// POST /api/share/:token/chat { text } → the message
// Guests on the share link (no login) chat as "Guest XXXX". Same rules as
// members: the link must be on, and sending needs 2+ people on the list.

type Ctx = RouteContext<"/api/share/[token]/chat">;

const INVALID = "This link is not valid or was turned off";

/** The list and the guest, or an error response. */
async function guestContext(request: Request, ctx: Ctx) {
  const guestId = cleanGuestId(request.headers.get(GUEST_ID_HEADER));
  if (!guestId) return jsonError("Missing guest id", 400);
  const { token } = await ctx.params;
  await connectDB();
  const folder = await folderForShareToken(token);
  if (!folder) return jsonError(INVALID, 404);
  return { folder, me: guestChatter(guestId) };
}

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const limit = rateLimit(`share-chat-read:${getClientIp(request)}`, { limit: 600 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const guest = await guestContext(request, ctx);
    if (guest instanceof Response) return guest;
    return await handleChatList(request, guest.folder, guest.me);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    // Stricter than members: anyone holding the link can post.
    const limit = rateLimit(`share-chat-send:${getClientIp(request)}`, { limit: 20, windowMs: 60_000 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const guest = await guestContext(request, ctx);
    if (guest instanceof Response) return guest;
    return await handleChatPost(request, guest.folder, guest.me);
  } catch (err) {
    return serverError(err);
  }
}
