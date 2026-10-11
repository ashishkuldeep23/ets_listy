import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { handlePresence, userChatter } from "@/lib/chat";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST /api/folders/:id/presence: "I have this list open" heartbeat (or
// { leave: true }) → who is here now. Any member, even view-only.

type Ctx = RouteContext<"/api/folders/[id]/presence">;

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    // A heartbeat every ~10 s per open tab fits well under this.
    const limit = rateLimit(`presence:${user.id}`, { limit: 600 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);

    return await handlePresence(request, access.folder, userChatter(user));
  } catch (err) {
    return serverError(err);
  }
}
