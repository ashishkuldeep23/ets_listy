import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { serializeShareLink } from "@/lib/shares";
import { jsonError, serverError } from "@/lib/http";
import { ShareLink, newShareToken } from "@/models/ShareLink";
import type { ShareLinkResponse } from "@/types";

// POST /api/folders/:id/share-link/reset → { link } with a new token.
// The old URL stops working at once; people who already joined keep access.
// Owner only.

type Ctx = RouteContext<"/api/folders/[id]/share-link/reset">;

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("List not found", 404);
    if (!access.canManage) return jsonError("Only the owner can manage the share link", 403);

    const link = await ShareLink.findOneAndUpdate(
      { folder: access.folder._id },
      { $set: { token: newShareToken() } },
      { returnDocument: "after" }
    ).lean();
    if (!link) return jsonError("This list has no share link yet", 404);

    const body: ShareLinkResponse = { link: serializeShareLink(link, new URL(request.url).origin) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}
