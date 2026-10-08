import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { getShareLink, serializeShareLink } from "@/lib/shares";
import { validateShareLink } from "@/lib/validators";
import { jsonError, readOptionalJson, serverError } from "@/lib/http";
import { mergePermissions } from "@/models/Share";
import { ShareLink, newShareToken } from "@/models/ShareLink";
import type { ShareLinkResponse } from "@/types";

// A folder's share link. Owner only (canManage): shared users get 403,
// anyone else 404.

type Ctx = RouteContext<"/api/folders/[id]/share-link">;

// GET /api/folders/:id/share-link → { link } (null if never created)
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    if (!access.canManage) return jsonError("Only the owner can manage the share link", 403);

    const body: ShareLinkResponse = { link: await getShareLink(access.folder._id, new URL(request.url).origin) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/folders/:id/share-link: { canCheck?, canEdit?, enabled? } → { link }.
// Creates the link the first time (enabled, view-only by default), then updates it.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    if (!access.canManage) return jsonError("Only the owner can manage the share link", 403);

    // An empty body is fine here: it just creates the link with defaults.
    const parsed = await readOptionalJson(request);
    if (parsed === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateShareLink(parsed);
    if (!result.ok) return jsonError(result.error, 400);

    const folderId = access.folder._id;
    const current = await ShareLink.findOne({ folder: folderId });
    const link = current ?? new ShareLink({ folder: folderId, token: newShareToken() });
    link.set({
      ...mergePermissions(link, result.value),
      ...(result.value.enabled !== undefined && { enabled: result.value.enabled }),
    });
    await link.save();

    const body: ShareLinkResponse = { link: serializeShareLink(link, new URL(request.url).origin) };
    return Response.json(body, { status: current ? 200 : 201 });
  } catch (err) {
    return serverError(err);
  }
}
