import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";
import { getFolderAccess } from "@/lib/access";
import { getShareLink, listShares } from "@/lib/shares";
import { validateSharePermissions } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Share, mergePermissions } from "@/models/Share";
import type { ShareListResponse } from "@/types";

// Change or remove one person's access to a folder.

type Ctx = RouteContext<"/api/folders/[id]/shares/[userId]">;

const NOT_FOUND = "Share not found";

// PATCH /api/folders/:id/shares/:userId: { canCheck?, canEdit? } → { shares, link }. Owner only.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id, userId } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    if (!access.canManage) return jsonError("Only the owner can change permissions", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateSharePermissions(body);
    if (!result.ok) return jsonError(result.error, 400);

    if (!mongoose.isValidObjectId(userId)) return jsonError(NOT_FOUND, 404);
    const share = await Share.findOne({ folder: access.folder._id, sharedWith: userId });
    if (!share) return jsonError(NOT_FOUND, 404);

    share.set(mergePermissions(share, result.value));
    await share.save();

    const res: ShareListResponse = {
      shares: await listShares(access.folder._id),
      link: await getShareLink(access.folder._id, new URL(request.url).origin),
    };
    return Response.json(res);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/folders/:id/shares/:userId → 204.
// The owner can remove anyone; a shared user can remove only themselves ("Leave folder").
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id, userId } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError("Folder not found", 404);
    const leaving = access.role === "shared" && userId === user.id;
    if (!access.canManage && !leaving) return jsonError("Only the owner can remove people", 403);

    if (!mongoose.isValidObjectId(userId)) return jsonError(NOT_FOUND, 404);
    const { deletedCount } = await Share.deleteOne({ folder: access.folder._id, sharedWith: userId });
    if (deletedCount === 0) return jsonError(NOT_FOUND, 404);
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
