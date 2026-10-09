import { getPublicShare } from "@/lib/shares";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { jsonError, serverError, tooManyRequests } from "@/lib/http";
import { isShareTokenShape } from "@/models/ShareLink";

// GET /api/share/:token → { list, items }: the PUBLIC, read-only view of a
// list behind an enabled share link. The one non-auth route that reads list
// data on purpose: the owner chose to publish it by creating the link.
// Turning the link off or resetting it makes this a 404 at once.

type Ctx = RouteContext<"/api/share/[token]">;

const INVALID = "This link is not valid or was turned off";

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    // Slow down token guessing (per IP, before any DB work). Higher than
    // accept's limit because a viewer may simply refresh the page.
    const limit = rateLimit(`share-view:${getClientIp(request)}`, { limit: 120 });
    if (!limit.ok) return tooManyRequests(limit.retryAfter);

    const { token } = await ctx.params;
    if (!isShareTokenShape(token)) return jsonError(INVALID, 404);

    const body = await getPublicShare(token);
    if (!body) return jsonError(INVALID, 404);
    // Never cache: a link that was just turned off must stop working.
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
