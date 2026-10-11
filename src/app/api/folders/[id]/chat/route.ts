import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { handleChatList, handleChatPost, userChatter } from "@/lib/chat";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { getSocketId } from "@/lib/realtime";

// GET  /api/folders/:id/chat[?after=ISO] → { messages }
// POST /api/folders/:id/chat { text } → the message (only while 2+ people have the list open)
// Any member may chat, even view-only: talking does not change the list.

type Ctx = RouteContext<"/api/folders/[id]/chat">;

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limit = rateLimit(`chat-read:${user.id}`, { limit: 600 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);

    return await handleChatList(request, access.folder, userChatter(user));
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const limit = rateLimit(`chat-send:${user.id}`, { limit: 30, windowMs: 60_000 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);

    return await handleChatPost(request, access.folder, userChatter(user), getSocketId(request));
  } catch (err) {
    return serverError(err);
  }
}
