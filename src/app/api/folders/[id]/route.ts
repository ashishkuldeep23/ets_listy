import { requireUser } from "@/lib/auth";
import { getFolderAccess, permissionsOf } from "@/lib/access";
import { validateUpdateFolder } from "@/lib/validators";
import { jsonError, readJson, serverError } from "@/lib/http";
import { Folder, serializeFolder } from "@/models/Folder";
import { Item } from "@/models/Item";
import { Share } from "@/models/Share";
import { ShareLink } from "@/models/ShareLink";
import { getSocketId, publishFolderEvent } from "@/lib/realtime";
import { EVENTS } from "@/lib/channels";
import type { FolderDetailDTO } from "@/types";

type Ctx = RouteContext<"/api/folders/[id]">;

// Access is decided only by getFolderAccess(): null → 404 (don't reveal
// the folder exists), missing permission → 403.

const NOT_FOUND = "Folder not found";

// GET /api/folders/:id
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);

    const body: FolderDetailDTO = { ...serializeFolder(access.folder), ...permissionsOf(access) };
    return Response.json(body);
  } catch (err) {
    return serverError(err);
  }
}

// PATCH /api/folders/:id: { name }
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canManage) return jsonError("Only the owner can change this folder", 403);

    const body = await readJson(request);
    if (body === undefined) return jsonError("Invalid JSON body", 400);
    const result = validateUpdateFolder(body);
    if (!result.ok) return jsonError(result.error, 400);

    const folder = await Folder.findByIdAndUpdate(
      id,
      { $set: result.value },
      { returnDocument: "after", runValidators: true }
    ).lean();
    if (!folder) return jsonError(NOT_FOUND, 404);
    const dto = serializeFolder(folder);
    await publishFolderEvent(id, EVENTS.folderUpdated, { folder: dto }, getSocketId(request));
    return Response.json(dto);
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/folders/:id
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { id } = await ctx.params;
    const access = await getFolderAccess(user.id, id);
    if (!access) return jsonError(NOT_FOUND, 404);
    if (!access.canManage) return jsonError("Only the owner can delete this folder", 403);

    // Delete everything that belongs to the folder, so nothing is left orphaned.
    await Item.deleteMany({ folder: access.folder._id });
    await Share.deleteMany({ folder: access.folder._id });
    await ShareLink.deleteMany({ folder: access.folder._id });
    await Folder.deleteOne({ _id: access.folder._id });
    await publishFolderEvent(id, EVENTS.folderDeleted, { folderId: id }, getSocketId(request));
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
